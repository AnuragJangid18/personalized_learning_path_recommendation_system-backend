const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { RunnableSequence, RunnablePassthrough } = require('@langchain/core/runnables');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function cosineSimilarity(A, B) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

class SimpleMemoryStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.docs = [];
  }
  async addDocuments(documents) {
    const texts = documents.map(d => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    for (let i = 0; i < documents.length; i++) {
      this.docs.push({ doc: documents[i], vector: vectors[i] });
    }
  }
  async invoke(query) {
    const queryText = typeof query === 'object' ? query.input : query;
    const queryVector = await this.embeddings.embedQuery(queryText);
    const scoredDocs = this.docs.map(item => ({
      doc: item.doc,
      score: cosineSimilarity(queryVector, item.vector)
    }));
    scoredDocs.sort((a, b) => b.score - a.score);
    return scoredDocs.slice(0, 3).map(item => item.doc);
  }
}

// Cache for document vector stores
const documentStores = {};

function splitTextIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    chunks.push({ pageContent: text.substring(index, index + chunkSize) });
    index += (chunkSize - overlap);
  }
  return chunks;
}

// Helper to generate a retriever from text using Google GenAI Embeddings
async function createRetriever(text, storeId) {
  const docs = splitTextIntoChunks(text, 1000, 200);
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-2-preview'
  });
  
  const vectorStore = new SimpleMemoryStore(embeddings);
  await vectorStore.addDocuments(docs);
  documentStores[storeId] = vectorStore;
}

// 1. Summarization Route
router.post('/summarize', express.json(), async (req, res) => {
  try {
    const { text, maxLength = 100, minLength = 30 } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for summarization' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is missing. Set it in .env' });
    }

    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-flash-latest',
      temperature: 0.2
    });

    const prompt = ChatPromptTemplate.fromTemplate(`
      You are an expert academic summarizer. Summarize the following text concisely and professionally.
      Limit your response length to roughly between {minLength} and {maxLength} words.
      
      Text to summarize:
      {text}
    `);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    
    const response = await chain.invoke({
      text: text,
      minLength: minLength,
      maxLength: maxLength
    });

    res.json({ summary: response });
  } catch (error) {
    console.error('Summarization Error:', error);
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
});

// 2. Extract Document Route (Optionally upload PDF to chat with)
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    const storeId = req.body.storeId || 'default';
    let text = '';
    
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const data = await pdfParse(req.file.buffer);
        text = data.text;
      } else {
        text = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.text) {
      text = req.body.text;
    } else {
      return res.status(400).json({ error: 'No document or text provided' });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: 'No extractable text found' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is missing. Set it in .env' });
    }

    await createRetriever(text, storeId);
    
    res.json({ message: 'Document processed and embedded successfully.', storeId });
  } catch (error) {
    console.error('Extraction Error:', error);
    res.status(500).json({ error: 'Failed to process document.' });
  }
});

// 3. Extract Document Route form URL
router.post('/upload-url', express.json(), async (req, res) => {
  try {
    const { pdfUrl, storeId = 'default' } = req.body;
    if (!pdfUrl) {
      return res.status(400).json({ error: 'pdfUrl is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is missing. Set it in .env' });
    }

    // Download PDF from URL to buffer
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    const data = await pdfParse(buffer);
    const text = data.text;

    if (!text.trim()) {
      return res.status(400).json({ error: 'No extractable text found in this PDF' });
    }

    await createRetriever(text, storeId);
    
    res.json({ message: 'Document from URL processed and embedded successfully.', storeId });
  } catch (error) {
    console.error('Upload URL Error:', error.message);
    res.status(500).json({ error: 'Failed to process document from URL. It may be restricted or invalid.' });
  }
});


// 4. Chat Route
router.post('/chat', express.json(), async (req, res) => {
  try {
    const { question, storeId = 'default' } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is missing. Set it in .env' });
    }

    const llm = new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-flash-latest',
      temperature: 0.3
    });

    const prompt = ChatPromptTemplate.fromTemplate(`
      Answer the question based only on the following context:
      {context}
      
      Question: {input}
    `);
    
    let chain;

    // Use retrieved context if we have a vector store
    if (documentStores[storeId]) {
       const retriever = documentStores[storeId];
       const formatDocs = (docs) => docs.map((doc) => doc.pageContent).join('\n\n');
       
       chain = RunnableSequence.from([
         {
           context: async (input) => formatDocs(await retriever.invoke(input.input)),
           input: new RunnablePassthrough()
         },
         prompt,
         llm,
         new StringOutputParser()
       ]);
       
       const response = await chain.invoke({ input: question });
       return res.json({ answer: response });
    } else {
       // Direct chat if no context is provided
       const directPrompt = ChatPromptTemplate.fromMessages([
         ["system", "You are a helpful AI assistant that helps students research academic topics and summarize findings."],
         ["human", "{input}"]
       ]);
       
       chain = directPrompt.pipe(llm).pipe(new StringOutputParser());
       const response = await chain.invoke({ input: question });
       return res.json({ answer: response });
    }
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'Failed to answer query.' });
  }
});

// 5. Search Papers Route
router.get('/search-papers', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Query is required for searching papers' });
    }
    
    // Using OpenAlex API due to generous free tier compared to Semantic Scholar
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=10`;
    const response = await axios.get(url);

    const reconstructAbstract = (invertedIndex) => {
      if (!invertedIndex) return 'No abstract available.';
      const wordPositions = [];
      for (const [word, positions] of Object.entries(invertedIndex)) {
        for (const pos of positions) {
          wordPositions.push({ word, pos });
        }
      }
      wordPositions.sort((a, b) => a.pos - b.pos);
      return wordPositions.map(wp => wp.word).join(' ');
    };

    const papers = response.data.results.map(work => ({
      paperId: work.id,
      title: work.title || 'Untitled',
      url: work.doi || work.id,
      abstract: reconstructAbstract(work.abstract_inverted_index),
      authors: (work.authorships || []).map(a => ({ name: a.author.display_name })),
      year: work.publication_year,
      openAccessPdf: work.open_access?.oa_url ? { url: work.open_access.oa_url } : null
    }));

    res.json({ papers });
  } catch (error) {
    console.error('Search Papers Error:', error.message);
    res.status(500).json({ error: 'Failed to search for research papers.' });
  }
});

module.exports = router;
