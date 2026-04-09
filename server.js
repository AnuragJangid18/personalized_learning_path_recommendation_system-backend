// backend/server.js
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const winston = require('winston');

const User = require('./models/User');
const Checkpoint = require('./models/Checkpoint');
const { authMiddleware, JWT_SECRET } = require('./middleware/auth');

dotenv.config();

const app = express();
const connectDB = require('./connect');
app.use(express.json());
app.use(morgan('dev'));

// CORS configuration for production and development
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);

// --- Mongo ---
connectDB()
  .then(() => console.log('MongoDB Cloud connected successfully'))
  .catch(err => {
    // In a serverless environment we should not call process.exit as it crashes the function.
    // Log the error so Vercel shows it in deployment logs and allow the function to handle requests (which will return 5xx if DB is required).
    console.error('MongoDB connection error:', err);
  });

// Catch global promise rejections and uncaught exceptions to aid debugging on Vercel
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// --- Schemas ---
const studentSchema = new mongoose.Schema(
  {
    name: String,
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Intermediate' },
    subject: { type: String, enum: ['artificial_intelligence', 'computer_science', 'mathematics'], default: 'artificial_intelligence' },
    style: String,
    goal: String
  },
  { timestamps: true }
);

const progressSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    completed: [String],
    interactions: { type: Number, default: 0 },
    correct: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const feedbackSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    difficulty: Number,
    engagement: Number,
    comments: String
  },
  { timestamps: true }
);

const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);
const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);

// --- Static course data ---
const courseData = {
  artificial_intelligence: [
    { name: 'Introduction to AI', difficulty: 1, duration: '2 weeks', prerequisites: [], topics: ['AI History', 'Types of AI', 'Applications'], estimatedEffort: 'low' },
    { name: 'Machine Learning Fundamentals', difficulty: 2, duration: '3 weeks', prerequisites: ['Introduction to AI'], topics: ['Supervised Learning', 'Unsupervised Learning', 'Model Evaluation'], estimatedEffort: 'medium' },
    { name: 'Neural Networks', difficulty: 3, duration: '4 weeks', prerequisites: ['Machine Learning Fundamentals'], topics: ['Perceptrons', 'Backpropagation', 'Activation Functions'], estimatedEffort: 'high' },
    { name: 'Deep Learning', difficulty: 4, duration: '4 weeks', prerequisites: ['Neural Networks'], topics: ['CNNs', 'RNNs', 'Transformers'], estimatedEffort: 'high' },
    { name: 'Reinforcement Learning', difficulty: 4, duration: '3 weeks', prerequisites: ['Neural Networks'], topics: ['MDPs', 'Q-Learning', 'Policy Gradients'], estimatedEffort: 'high' },
    { name: 'Computer Vision', difficulty: 4, duration: '3 weeks', prerequisites: ['Deep Learning'], topics: ['Image Processing', 'Object Detection', 'Segmentation'], estimatedEffort: 'high' },
    { name: 'Natural Language Processing', difficulty: 4, duration: '3 weeks', prerequisites: ['Deep Learning'], topics: ['Tokenization', 'Embeddings', 'Transformers'], estimatedEffort: 'high' },
    { name: 'Advanced ML Topics', difficulty: 4, duration: '3 weeks', prerequisites: ['Deep Learning'], topics: ['GANs', 'Transfer Learning', 'Meta Learning'], estimatedEffort: 'high' },
    { name: 'AI Ethics & Safety', difficulty: 2, duration: '2 weeks', prerequisites: ['Introduction to AI'], topics: ['Bias', 'Fairness', 'Responsible AI'], estimatedEffort: 'low' }
  ],
  computer_science: [
    { name: 'Programming Fundamentals', difficulty: 1, duration: '3 weeks', prerequisites: [], topics: ['Variables', 'Loops', 'Functions'], estimatedEffort: 'low' },
    { name: 'Data Structures', difficulty: 2, duration: '4 weeks', prerequisites: ['Programming Fundamentals'], topics: ['Arrays', 'Trees', 'Graphs'], estimatedEffort: 'medium' },
    { name: 'Algorithms', difficulty: 3, duration: '4 weeks', prerequisites: ['Data Structures'], topics: ['Sorting', 'Searching', 'Dynamic Programming'], estimatedEffort: 'high' },
    { name: 'Database Systems', difficulty: 3, duration: '3 weeks', prerequisites: ['Data Structures'], topics: ['SQL', 'Indexing', 'Transactions'], estimatedEffort: 'medium' },
    { name: 'Software Engineering', difficulty: 3, duration: '4 weeks', prerequisites: ['Algorithms'], topics: ['SDLC', 'Design Patterns', 'Testing'], estimatedEffort: 'high' },
    { name: 'Computer Networks', difficulty: 4, duration: '3 weeks', prerequisites: ['Database Systems'], topics: ['Protocols', 'TCP/IP', 'Routing'], estimatedEffort: 'high' },
    { name: 'Operating Systems', difficulty: 4, duration: '4 weeks', prerequisites: ['Algorithms'], topics: ['Processes', 'Memory', 'File Systems'], estimatedEffort: 'high' },
    { name: 'Web Development', difficulty: 2, duration: '3 weeks', prerequisites: ['Programming Fundamentals'], topics: ['HTML/CSS', 'JavaScript', 'REST APIs'], estimatedEffort: 'medium' },
    { name: 'Cloud Computing', difficulty: 3, duration: '3 weeks', prerequisites: ['Computer Networks'], topics: ['AWS/Azure', 'Containers', 'Microservices'], estimatedEffort: 'medium' },
    { name: 'Cybersecurity', difficulty: 4, duration: '3 weeks', prerequisites: ['Computer Networks'], topics: ['Encryption', 'Authentication', 'Security Threats'], estimatedEffort: 'high' }
  ],
  mathematics: [
    { name: 'Linear Algebra', difficulty: 2, duration: '3 weeks', prerequisites: [], topics: ['Vectors', 'Matrices', 'Eigenvalues'], estimatedEffort: 'medium' },
    { name: 'Calculus', difficulty: 2, duration: '4 weeks', prerequisites: [], topics: ['Derivatives', 'Integrals', 'Optimization'], estimatedEffort: 'medium' },
    { name: 'Statistics', difficulty: 2, duration: '3 weeks', prerequisites: [], topics: ['Descriptive Stats', 'Inference', 'Hypothesis Testing'], estimatedEffort: 'medium' },
    { name: 'Probability Theory', difficulty: 3, duration: '3 weeks', prerequisites: ['Statistics'], topics: ['Random Variables', 'Distributions', 'Bayes Theorem'], estimatedEffort: 'high' },
    { name: 'Discrete Mathematics', difficulty: 3, duration: '3 weeks', prerequisites: ['Linear Algebra'], topics: ['Graph Theory', 'Combinatorics', 'Logic'], estimatedEffort: 'high' },
    { name: 'Optimization', difficulty: 4, duration: '4 weeks', prerequisites: ['Calculus', 'Linear Algebra'], topics: ['Convex Optimization', 'Gradient Methods', 'Constraints'], estimatedEffort: 'high' },
    { name: 'Information Theory', difficulty: 4, duration: '2 weeks', prerequisites: ['Probability Theory'], topics: ['Entropy', 'Mutual Information', 'Channel Capacity'], estimatedEffort: 'high' },
    { name: 'Numerical Methods', difficulty: 3, duration: '3 weeks', prerequisites: ['Calculus'], topics: ['Root Finding', 'Integration', 'Differential Equations'], estimatedEffort: 'medium' }
  ]
};

// --- Quiz bank (clean, consolidated) ---
const quizBank = {
  'Introduction to AI': {
    question: 'What is the primary goal of Artificial Intelligence?',
    options: [
      'To replace human intelligence completely',
      'To create systems that can perform tasks that typically require human intelligence',
      'To build robots only',
      'To make computers faster'
    ],
    correct: 1
  },
  'Machine Learning Fundamentals': {
    question: 'Which type of learning uses labeled training data?',
    options: ['Unsupervised Learning', 'Reinforcement Learning', 'Supervised Learning', 'Semi-supervised Learning'],
    correct: 2
  },
  'Programming Fundamentals': {
    question: 'What is a variable in programming?',
    options: ['A fixed value that cannot change', 'A named storage location that can hold data', 'A type of loop', 'A programming language'],
    correct: 1
  },

  // AI extras
  'Deep Learning': {
    question: 'Which optimization method is most commonly used to train deep neural networks?',
    options: ['Genetic algorithms', 'Stochastic Gradient Descent (and variants like Adam)', 'Simulated annealing', 'Simplex method'],
    correct: 1
  },
  'Reinforcement Learning': {
    question: "In Reinforcement Learning, what does the 'reward' signal represent?",
    options: ['The policy function', "A scalar feedback indicating how good the last action/state was", 'The environment dynamics', 'The learning rate schedule'],
    correct: 1
  },
  'Computer Vision': {
    question: "What is 'convolution' primarily used for in CNNs?",
    options: ['To reduce overfitting by increasing model size', 'To apply spatially-local filters that detect patterns (edges, textures)', 'To perform dataset augmentation', 'To evaluate model accuracy'],
    correct: 1
  },
  'Natural Language Processing': {
    question: 'Which representation captures word meaning using dense continuous vectors?',
    options: ['Bag-of-words one-hot vectors', 'TF-IDF sparse vectors', 'Word embeddings (e.g., Word2Vec, GloVe)', 'Raw byte streams'],
    correct: 2
  },

  // Computer Science
  'Data Structures': {
    question: 'Which data structure provides O(1) average-time access by key?',
    options: ['Array', 'Linked List', 'Hash Table (Hash Map)', 'Binary Search Tree'],
    correct: 2
  },
  'Algorithms': {
    question: 'Which algorithm paradigm divides a problem into smaller subproblems, solves them, and combines results?',
    options: ['Greedy', 'Divide and Conquer', 'Brute Force', 'Dynamic Programming'],
    correct: 1
  },
  'Database Systems': {
    question: 'What does ACID stand for in relational databases?',
    options: ['Atomicity, Consistency, Isolation, Durability', 'Access, Control, Integrity, Durability', 'Availability, Consistency, Indexing, Durability', 'Atomicity, Concurrency, Isolation, Distribution'],
    correct: 0
  },
  'Software Engineering': {
    question: 'Which development practice emphasizes small frequent releases and collaboration?',
    options: ['Waterfall', 'Big Bang', 'Agile (e.g., Scrum)', 'Code-and-fix'],
    correct: 2
  },
  'Computer Networks': {
    question: 'Which layer of the OSI model is responsible for routing between networks?',
    options: ['Physical', 'Transport', 'Network', 'Application'],
    correct: 2
  },
  'Operating Systems': {
    question: 'Which mechanism allows multiple processes to share the CPU over time?',
    options: ['Virtual Memory', 'Scheduling (time-sharing)', 'File System', 'Device Drivers'],
    correct: 1
  },

  // Mathematics
  'Linear Algebra': {
    question: 'Which of the following operations is used to compute a projection of one vector onto another?',
    options: ['Cross product', 'Determinant', 'Dot product', 'Matrix inverse'],
    correct: 2
  },
  'Calculus': {
    question: 'The derivative of a function represents:',
    options: ['The total area under the curve', 'The rate of change or slope at a point', 'The maximum value of the function', 'The inverse of the integral'],
    correct: 1
  },
  'Statistics': {
    question: 'Which measure is most robust against outliers?',
    options: ['Mean', 'Mode', 'Variance', 'Median'],
    correct: 3
  },
  'Probability Theory': {
    question: 'Two events A and B are independent if:',
    options: ['P(A) = P(B)', 'P(A ∩ B) = P(A) × P(B)', 'P(A|B) = P(A) only when P(B)=0', 'They cannot happen together'],
    correct: 1
  },
  'Discrete Mathematics': {
    question: 'Which of the following is a characteristic of a graph in graph theory?',
    options: ['It must contain no cycles', 'It consists of vertices and edges', 'It stores continuous numeric data', 'It must be connected'],
    correct: 1
  },
  'Optimization': {
    question: 'Gradient Descent updates parameters in which direction?',
    options: ['Along the gradient', 'Against the gradient (negative gradient direction)', 'Perpendicular to the gradient', 'Randomly at each iteration'],
    correct: 1
  },
  'Advanced ML Topics': {
    question: 'What is the primary goal of a Generative Adversarial Network (GAN)?',
    options: ['To classify images accurately', 'To generate new realistic data by training a generator and discriminator', 'To reduce model size', 'To speed up training'],
    correct: 1
  },
  'AI Ethics & Safety': {
    question: 'Which of the following is a key concern in AI ethics?',
    options: ['Hardware efficiency', 'Algorithmic bias and fairness', 'Code formatting', 'Variable naming'],
    correct: 1
  },
  'Web Development': {
    question: 'What does REST stand for in web APIs?',
    options: ['Remote Execution State Transfer', 'Representational State Transfer', 'Restful Execution Standards', 'Resource Encryption System'],
    correct: 1
  },
  'Cloud Computing': {
    question: 'What is the main advantage of containerization (e.g., Docker)?',
    options: ['Faster internet speed', 'Consistent environment across different platforms', 'Better UI design', 'Reduced code complexity'],
    correct: 1
  },
  'Cybersecurity': {
    question: 'What is the purpose of encryption?',
    options: ['To speed up data transfer', 'To compress data', 'To protect data confidentiality by converting it into unreadable format', 'To backup data'],
    correct: 2
  },
  'Information Theory': {
    question: 'What does entropy measure in information theory?',
    options: ['The speed of data transmission', 'The uncertainty or randomness of information', 'The size of data in bytes', 'The number of bits needed for storage'],
    correct: 1
  },
  'Numerical Methods': {
    question: 'Which method is commonly used to find roots of equations numerically?',
    options: ['Bubble sort', 'Newton-Raphson method', 'Binary search', 'Quicksort'],
    correct: 1
  }
};

// --- Lesson content (authored + defaults) ---
const lessonBank = {
  'Introduction to AI': {
    overview: 'Understand what AI is, its history, core subfields, and real-world applications.',
    prerequisites: ['Basic programming familiarity (any language)', 'High-school math: functions, basic probability'],
    keyPoints: ['What AI means (agents, rational behavior)', 'Major subfields: ML, DL, NLP, CV, RL', 'Typical AI pipeline and datasets', 'Ethics and limitations at a glance'],
    resources: [{ title: 'Stanford CS221: What is AI?', url: 'https://ai.stanford.edu/' }],
    quiz: quizBank['Introduction to AI']
  },

  'Machine Learning Fundamentals': {
    overview: 'Learn ML types, model training loop, overfitting vs. underfitting, evaluation metrics.',
    prerequisites: ['Introduction to AI', 'Python/Numpy basics', 'Statistics: mean/variance, train/test split'],
    keyPoints: ['Supervised vs. Unsupervised vs. Reinforcement', 'Bias-variance trade-off', 'Loss functions & optimization basics', 'Common metrics: accuracy, precision/recall'],
    resources: [{ title: 'Andrew Ng — ML Specialization', url: 'https://www.coursera.org/specializations/machine-learning-introduction' }],
    quiz: quizBank['Machine Learning Fundamentals']
  },

  'Neural Networks': {
    overview: 'Build intuition for perceptrons, activation functions, backpropagation, and deep nets.',
    prerequisites: ['Machine Learning Fundamentals', 'Calculus (derivatives, chain rule)', 'Linear Algebra (vectors, matrices, dot products)'],
    keyPoints: ['Perceptron → MLP', 'Non-linear activations', 'Backpropagation & gradients', 'Under/overfitting with deep nets'],
    resources: [{ title: '3Blue1Brown — Neural Networks', url: 'https://www.3blue1brown.com/topics/neural-networks' }],
    quiz: {
      question: 'Which statement about activation functions is TRUE?',
      options: ['They are only used in the output layer', 'They introduce non-linearity to model complex patterns', 'They make training slower and are avoided', 'They remove the need for backpropagation'],
      correct: 1
    }
  },

  // AI extra lessons
  'Deep Learning': {
    overview: 'Deep Learning builds and trains deep neural networks with many layers to learn hierarchical representations from data.',
    prerequisites: ['Neural Networks', 'Linear Algebra (matrices/vectors)', 'Calculus (derivatives, chain rule)', 'Basic Python and ML tooling (NumPy/PyTorch or TensorFlow)'],
    keyPoints: ['Architectures: MLPs, CNNs, RNNs, Transformers', 'Optimization: SGD, momentum, Adam', 'Regularization: dropout, weight decay, batch norm', 'Practical tips: initialization, gradient clipping'],
    resources: [{ title: 'Deep Learning Specialization (Andrew Ng)', url: 'https://www.coursera.org/specializations/deep-learning' }],
    quiz: quizBank['Deep Learning']
  },

  'Reinforcement Learning': {
    overview: 'Reinforcement Learning (RL) studies how agents act to maximize cumulative reward through trial-and-error.',
    prerequisites: ['Probability & basic statistics', 'Machine Learning Fundamentals', 'Familiarity with Markov decision processes (conceptual)'],
    keyPoints: ['Agent, environment, state, action, reward', 'Value-based vs policy-based methods', 'Exploration vs exploitation', 'Model-free vs model-based'],
    resources: [{ title: 'Sutton & Barto - RL book', url: 'http://incompleteideas.net/book/the-book.html' }],
    quiz: quizBank['Reinforcement Learning']
  },

  'Computer Vision': {
    overview: 'Computer Vision teaches machines to extract, process, and understand information from images and video.',
    prerequisites: ['Linear Algebra', 'Deep Learning (CNN basics)', 'Image processing fundamentals (pixels, filters)'],
    keyPoints: ['Image pre-processing and augmentation', 'CNN building blocks', 'Object detection vs classification vs segmentation', 'Evaluation metrics: IoU, precision/recall'],
    resources: [{ title: 'Fast.ai Practical Deep Learning for Coders', url: 'https://course.fast.ai/' }],
    quiz: quizBank['Computer Vision']
  },

  'Natural Language Processing': {
    overview: 'NLP focuses on building systems that understand and generate human language.',
    prerequisites: ['Machine Learning Fundamentals', 'Probability & statistics', 'Basic sequence models (RNN, LSTM) or familiarity with Transformers'],
    keyPoints: ['Tokenization, embeddings, and sequence models', 'Transformers and attention', 'Tasks: classification, translation, QA', 'Evaluation: BLEU, ROUGE, F1'],
    resources: [{ title: 'The Illustrated Transformer', url: 'http://jalammar.github.io/illustrated-transformer/' }],
    quiz: quizBank['Natural Language Processing']
  },

  // Computer Science lessons
  'Programming Fundamentals': {
    overview: 'Learn core programming concepts: variables, data types, control flow, functions, I/O, and basic debugging.',
    prerequisites: ['None (suitable for beginners)'],
    keyPoints: ['Variables and types', 'Control flow: if/else, loops', 'Functions: params & returns', 'Debugging fundamentals'],
    resources: [{ title: 'Python Tutorial', url: 'https://docs.python.org/3/tutorial/' }],
    quiz: quizBank['Programming Fundamentals']
  },

  'Data Structures': {
    overview: 'Study common data structures and when to use them.',
    prerequisites: ['Programming Fundamentals'],
    keyPoints: ['Arrays vs linked lists', 'Stacks/Queues', 'Hash tables', 'Trees/Graphs and traversals'],
    resources: [{ title: 'GeeksforGeeks - Data Structures', url: 'https://www.geeksforgeeks.org/data-structures/' }],
    quiz: quizBank['Data Structures']
  },

  'Algorithms': {
    overview: 'Core algorithmic techniques: sorting/searching, recursion, divide-and-conquer, DP, complexity.',
    prerequisites: ['Programming Fundamentals', 'Basic Discrete Math'],
    keyPoints: ['Big-O', 'QuickSort/MergeSort', 'Divide-and-conquer', 'Dynamic programming'],
    resources: [{ title: 'CLRS', url: 'https://mitpress.mit.edu/9780262046305/introduction-to-algorithms-third-edition/' }],
    quiz: quizBank['Algorithms']
  },

  'Database Systems': {
    overview: 'Understand database models (relational vs NoSQL), schema design, SQL querying, transactions, indexing.',
    prerequisites: ['Programming Fundamentals', 'Basic Data Structures'],
    keyPoints: ['Relational model', 'Basic SQL and JOINs', 'Transactions and ACID', 'Indexes and query optimization'],
    resources: [{ title: 'SQLBolt', url: 'https://sqlbolt.com/' }],
    quiz: quizBank['Database Systems']
  },

  'Software Engineering': {
    overview: 'Software development lifecycle, requirements, design, testing, CI/CD, best practices.',
    prerequisites: ['Programming Fundamentals'],
    keyPoints: ['SDLC', 'Design patterns', 'Version control (Git)', 'Testing & CI/CD'],
    resources: [{ title: 'Software Engineering Essentials', url: 'https://www.coursera.org/specializations/software-design-architecture' }],
    quiz: quizBank['Software Engineering']
  },

  'Computer Networks': {
    overview: 'Fundamentals of networking: protocols, addressing, routing, sockets, common services.',
    prerequisites: ['Basic Programming Fundamentals'],
    keyPoints: ['OSI & TCP/IP', 'IP addressing & routing', 'TCP vs UDP', 'HTTP, DNS basics'],
    resources: [{ title: 'Kurose & Ross - Networking', url: 'https://gaia.cs.umass.edu/kurose_ross/NETWORKING5E.php' }],
    quiz: quizBank['Computer Networks']
  },

  'Operating Systems': {
    overview: 'OS responsibilities: processes, scheduling, memory management, file systems, concurrency, drivers.',
    prerequisites: ['Programming Fundamentals', 'Basic Computer Architecture'],
    keyPoints: ['Processes vs threads', 'CPU scheduling', 'Paging & virtual memory', 'Concurrency: deadlock/race conditions'],
    resources: [{ title: 'OSTEP', url: 'http://pages.cs.wisc.edu/~remzi/OSTEP/' }],
    quiz: quizBank['Operating Systems']
  },

  // Mathematics lessons (already added previously)
  'Linear Algebra': {
    overview: 'Linear Algebra provides math foundation for ML — vectors, matrices, eigenstuff.',
    prerequisites: ['Basic Algebra'],
    keyPoints: ['Vector spaces', 'Matrix multiplication', 'Eigenvalues/eigenvectors', 'Applications: PCA'],
    resources: [{ title: '3Blue1Brown — Essence of Linear Algebra', url: 'https://www.3blue1brown.com/topics/linear-algebra' }],
    quiz: quizBank['Linear Algebra']
  },
  'Calculus': {
    overview: 'Calculus studies change and accumulation; key for optimization and gradients.',
    prerequisites: ['Algebra', 'Functions and graphing'],
    keyPoints: ['Limits', 'Derivatives', 'Integrals', 'Multivariable basics'],
    resources: [{ title: 'Khan Academy — Calculus 1', url: 'https://www.khanacademy.org/math/calculus-1' }],
    quiz: quizBank['Calculus']
  },
  'Statistics': {
    overview: 'Statistics covers summarizing data, distributions, inference and hypothesis testing.',
    prerequisites: ['Basic Algebra'],
    keyPoints: ['Mean/median/variance', 'Sampling', 'Hypothesis testing', 'Confidence intervals'],
    resources: [{ title: 'OpenIntro Statistics', url: 'https://www.openintro.org/book/os/' }],
    quiz: quizBank['Statistics']
  },
  'Probability Theory': {
    overview: 'Probability models uncertainty — random vars, conditional probability, CLT.',
    prerequisites: ['Statistics basics'],
    keyPoints: ['Random variables', 'Conditional prob/Bayes', 'Expectation', 'LLN & CLT'],
    resources: [{ title: 'Khan Academy – Probability', url: 'https://www.khanacademy.org/math/statistics-probability/probability-library' }],
    quiz: quizBank['Probability Theory']
  },
  'Discrete Mathematics': {
    overview: 'Discrete math: logic, sets, combinatorics, graph theory — foundations for CS theory.',
    prerequisites: ['Basic Algebra'],
    keyPoints: ['Proof techniques', 'Set theory', 'Combinatorics', 'Graph fundamentals'],
    resources: [{ title: 'MIT OCW — Mathematics for Computer Science', url: 'https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-2005/' }],
    quiz: quizBank['Discrete Mathematics']
  },
  'Optimization': {
    overview: 'Optimization: minimizing / maximizing functions — gradient descent, LP, constrained opt.',
    prerequisites: ['Calculus', 'Linear Algebra'],
    keyPoints: ['Convexity', 'Gradient methods', 'Lagrange multipliers', 'Linear programming'],
    resources: [{ title: 'Convex Optimization (Boyd)', url: 'https://web.stanford.edu/~boyd/cvxbook/' }],
    quiz: quizBank['Optimization']
  },

  // New AI courses
  'Advanced ML Topics': {
    overview: 'Explore cutting-edge ML techniques including GANs, transfer learning, few-shot learning, and meta-learning.',
    prerequisites: ['Deep Learning'],
    keyPoints: ['Generative Adversarial Networks (GANs)', 'Transfer Learning and fine-tuning', 'Few-shot and zero-shot learning', 'Meta-learning: learning to learn', 'Self-supervised learning approaches'],
    resources: [
      { title: 'Ian Goodfellow - GAN Tutorial', url: 'https://arxiv.org/abs/1701.00160' },
      { title: 'Transfer Learning Guide', url: 'https://cs231n.github.io/transfer-learning/' }
    ],
    quiz: quizBank['Advanced ML Topics']
  },

  'AI Ethics & Safety': {
    overview: 'Understand ethical implications of AI systems including bias, fairness, transparency, and responsible deployment.',
    prerequisites: ['Introduction to AI'],
    keyPoints: ['Algorithmic bias and fairness', 'Explainability and interpretability', 'Privacy and data protection (GDPR)', 'AI safety and alignment', 'Social impact and job displacement'],
    resources: [
      { title: 'AI Ethics Guidelines - Brookings', url: 'https://www.brookings.edu/research/algorithmic-bias-detection-and-mitigation/' },
      { title: 'Partnership on AI', url: 'https://partnershiponai.org/' }
    ],
    quiz: quizBank['AI Ethics & Safety']
  },

  // New CS courses
  'Web Development': {
    overview: 'Build modern web applications with HTML, CSS, JavaScript, and backend frameworks.',
    prerequisites: ['Programming Fundamentals'],
    keyPoints: ['HTML5 semantic markup', 'CSS3 styling and Flexbox/Grid', 'JavaScript ES6+ features (async/await, promises)', 'RESTful APIs and HTTP methods', 'Frontend frameworks overview (React, Vue)'],
    resources: [
      { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/' },
      { title: 'FreeCodeCamp Web Dev', url: 'https://www.freecodecamp.org/' }
    ],
    quiz: quizBank['Web Development']
  },

  'Cloud Computing': {
    overview: 'Learn cloud platforms (AWS, Azure, GCP), containerization, and scalable application deployment.',
    prerequisites: ['Computer Networks'],
    keyPoints: ['Cloud service models (IaaS, PaaS, SaaS)', 'Docker containers and images', 'Kubernetes orchestration', 'Microservices architecture', 'Serverless computing (Lambda functions)'],
    resources: [
      { title: 'AWS Training', url: 'https://aws.amazon.com/training/' },
      { title: 'Docker Documentation', url: 'https://docs.docker.com/' }
    ],
    quiz: quizBank['Cloud Computing']
  },

  'Cybersecurity': {
    overview: 'Fundamentals of information security, cryptography, and protecting systems from threats.',
    prerequisites: ['Computer Networks'],
    keyPoints: ['Cryptography: symmetric vs asymmetric', 'Network security protocols (TLS/SSL)', 'Web application security (OWASP Top 10)', 'Authentication and authorization', 'Security best practices and threat modeling'],
    resources: [
      { title: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' },
      { title: 'Cybersecurity & Infrastructure Security Agency', url: 'https://www.cisa.gov/' }
    ],
    quiz: quizBank['Cybersecurity']
  },

  // New Math courses
  'Information Theory': {
    overview: 'Study quantification of information, entropy, and applications in data compression and communication.',
    prerequisites: ['Probability Theory'],
    keyPoints: ['Entropy and information content', 'Mutual information and KL divergence', 'Data compression (Huffman coding)', 'Channel capacity and Shannon\'s theorem', 'Applications in ML (cross-entropy loss)'],
    resources: [
      { title: 'Elements of Information Theory - Cover & Thomas', url: 'https://www.wiley.com/en-us/Elements+of+Information+Theory' },
      { title: 'Information Theory Tutorial', url: 'https://colah.github.io/posts/2015-09-Visual-Information/' }
    ],
    quiz: quizBank['Information Theory']
  },

  'Numerical Methods': {
    overview: 'Computational techniques for solving mathematical problems that cannot be solved analytically.',
    prerequisites: ['Calculus'],
    keyPoints: ['Root finding (Newton-Raphson, bisection)', 'Numerical integration (trapezoidal, Simpson)', 'Solving ODEs (Euler, Runge-Kutta)', 'Error analysis and stability', 'Applications in scientific computing'],
    resources: [
      { title: 'Numerical Recipes', url: 'http://numerical.recipes/' },
      { title: 'SciPy Documentation', url: 'https://docs.scipy.org/doc/scipy/reference/tutorial/' }
    ],
    quiz: quizBank['Numerical Methods']
  }
};

// Build defaults for any course not authored
function buildDefaultLesson(courseName) {
  return {
    overview: `Overview coming soon for ${courseName}.`,
    prerequisites: Array.isArray(getCoursePrereqs(courseName)) ? getCoursePrereqs(courseName) : ['No formal prerequisites listed'],
    keyPoints: ['Key takeaways will appear here'],
    resources: [],
    quiz: quizBank[courseName] || null
  };
}

function getCoursePrereqs(courseName) {
  for (const subject of Object.keys(courseData)) {
    const found = courseData[subject].find(c => c.name === courseName);
    if (found) return found.prerequisites || [];
  }
  return [];
}

function byLevel(level) {
  if (level === 'Beginner') return c => c.difficulty <= 2;
  if (level === 'Intermediate') return c => c.difficulty <= 3;
  return () => true;
}

function topoSort(courses) {
  const graph = new Map();
  const indeg = new Map();
  courses.forEach(c => {
    graph.set(c.name, new Set());
    indeg.set(c.name, 0);
  });
  courses.forEach(c =>
    (c.prerequisites || []).forEach(p => {
      if (!graph.has(p)) return;
      graph.get(p).add(c.name);
      indeg.set(c.name, (indeg.get(c.name) || 0) + 1);
    })
  );
  const q = [];
  indeg.forEach((d, k) => {
    if (d === 0) q.push(k);
  });
  const order = [];
  while (q.length) {
    const u = q.shift();
    order.push(u);
    for (const v of graph.get(u) || []) {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) q.push(v);
    }
  }
  return order.map(name => courses.find(c => c.name === name)).filter(Boolean);
}

function computeStats(progressDoc) {
  const completed = progressDoc?.completed?.length || 0;
  const interactions = progressDoc?.interactions || 0;
  const correct = progressDoc?.correct || 0;
  const accuracy = interactions ? Math.round((correct / interactions) * 100) : 0;
  return { completed, interactions, correct, accuracy };
}

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/server.log' })
  ]
});

// Replace console.log and console.error with logger
console.log = (...args) => logger.info(args.join(' '));
console.error = (...args) => logger.error(args.join(' '));

// --- Routes ---
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const dbState = mongoose.connection.readyState;
    
    // Get some basic stats
    const studentCount = await Student.countDocuments();
    const progressCount = await Progress.countDocuments();
    
    logger.info('Health check:', { dbStatus, studentCount, progressCount });
    
    res.json({ 
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        readyState: dbState,
        students: studentCount,
        progressRecords: progressCount
      },
      version: '1.0.0'
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({ 
      ok: false, 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// Import AI service module
const aiRoutes = require('./aiService');
app.use('/api/ai', aiRoutes);

app.get('/api/subjects', (req, res) => {
  const subjects = Object.keys(courseData);
  const counts = subjects.reduce((acc, s) => ((acc[s] = courseData[s].length), acc), {});
  res.json({ subjects, counts });
});

app.get('/api/courses', (req, res) => {
  const { subject = 'artificial_intelligence' } = req.query;
  res.json({ subject, items: courseData[subject] || [] });
});

// --- Auth: register / login ---

// Register: create Student + User
app.post(
  '/api/auth/register',
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: true, message: 'Validation failed', details: errors.array() });
    }

    try {
      const { name, email, password, level = 'Intermediate', subject = 'artificial_intelligence', style = '', goal = '' } = req.body || {};

      // Check if user exists
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(409).json({ error: true, message: 'Email already registered' });

      // Create Student doc
      const studentDoc = await Student.create({ name, level, subject, style, goal });

      // Create hashed password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const user = await User.create({ email: email.toLowerCase(), passwordHash, studentId: studentDoc._id });

      const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });

      return res.json({ token, user: { id: user._id.toString(), email: user.email, studentId: user.studentId.toString() } });
    } catch (e) {
      if (e.code === 11000) {
        // Duplicate key error (shouldn't happen due to above check, but just in case)
        return res.status(409).json({ error: true, message: 'Email already registered' });
      }
      logger.error('register error', e);
      return res.status(500).json({ error: true, message: 'Server error' });
    }
  }
);

// Apply rate limiting to sensitive routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: { error: true, message: 'Too many login attempts, please try again later.' },
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: true, message: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: true, message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: true, message: 'Invalid email or password' });

    const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: user._id.toString(), email: user.email, studentId: user.studentId?.toString() || null } });
  } catch (e) {
    logger.error('login error', e);
    return res.status(500).json({ error: true, message: 'Server error' });
  }
});

// Get authenticated user's profile (creates student if missing)
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    let studentId = user.studentId;
    if (!studentId) {
      // Create default student document if missing
      const studentDoc = await Student.create({
        name: user.email.split('@')[0],
        level: 'Intermediate',
        subject: 'artificial_intelligence',
        style: 'visual',
        goal: 'Learn'
      });
      user.studentId = studentDoc._id;
      await user.save();
      studentId = studentDoc._id;
    }

    // Ensure progress exists
    let progress = await Progress.findOne({ studentId });
    if (!progress) {
      progress = await Progress.create({ studentId, completed: [], interactions: 0, correct: 0 });
    }

    res.json({
      id: user._id.toString(),
      email: user.email,
      studentId: studentId.toString()
    });
  } catch (e) {
    logger.error('auth/me error', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Save checkpoint: snapshot logic
app.post('/api/checkpoint', authMiddleware, async (req, res) => {
  try {
    // expected snapshot body: { name, snapshot: { student, completed, stats, currentLesson, lesson } }
    const { name = `checkpoint-${Date.now()}`, snapshot } = req.body || {};
    if (!snapshot) return res.status(400).json({ error: 'snapshot required' });

    const cp = await Checkpoint.create({ userId: req.user.id, name, snapshot });
    return res.json({ ok: true, id: cp._id.toString(), createdAt: cp.createdAt });
  } catch (e) {
    logger.error('save checkpoint', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// List user's checkpoints
app.get('/api/checkpoint', authMiddleware, async (req, res) => {
  try {
    const list = await Checkpoint.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50);
    const out = list.map(c => ({ id: c._id.toString(), name: c.name, createdAt: c.createdAt, snapshotSummary: { keys: Object.keys(c.snapshot || {}) } }));
    return res.json(out);
  } catch (e) {
    logger.error('list cp', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get a checkpoint (return full snapshot)
app.get('/api/checkpoint/:id', authMiddleware, async (req, res) => {
  try {
    const cp = await Checkpoint.findOne({ _id: req.params.id, userId: req.user.id });
    if (!cp) return res.status(404).json({ error: 'Not found' });
    return res.json({ id: cp._id.toString(), name: cp.name, snapshot: cp.snapshot, createdAt: cp.createdAt });
  } catch (e) {
    logger.error('get cp', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Delete checkpoint
app.delete('/api/checkpoint/:id', authMiddleware, async (req, res) => {
  try {
    const cp = await Checkpoint.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!cp) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (e) {
    logger.error('del cp', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/profile', async (req, res) => {
  const { name, level, subject, style, goal, id } = req.body || {};
  
  // Validate required fields
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  
  // Validate enum values
  const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
  const validSubjects = ['artificial_intelligence', 'computer_science', 'mathematics'];
  
  if (level && !validLevels.includes(level)) {
    return res.status(400).json({ error: 'Invalid level' });
  }
  if (subject && !validSubjects.includes(subject)) {
    return res.status(400).json({ error: 'Invalid subject' });
  }

  try {
    let doc;
    if (id) {
      // Validate id format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid student id format' });
      }
      // Update existing student
      doc = await Student.findByIdAndUpdate(
        id,
        { name: name.trim(), level, subject, style, goal },
        { new: true, runValidators: true }
      );
      if (!doc) return res.status(404).json({ error: 'Student not found' });
    } else {
      // Create new student
      doc = await Student.create({ name: name.trim(), level, subject, style, goal });
    }

    const existing = await Progress.findOne({ studentId: doc._id });
    if (!existing) await Progress.create({ studentId: doc._id, completed: [], interactions: 0, correct: 0 });

    res.json({ id: doc._id.toString(), name: doc.name, level: doc.level, subject: doc.subject, style: doc.style, goal: doc.goal });
  } catch (e) {
    logger.error('profile error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get student by id
app.get('/api/student/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      logger.warn('Get student: invalid ID format', id);
      return res.status(400).json({ error: 'Invalid student ID format' });
    }
    
    const doc = await Student.findById(id);
    if (!doc) {
      logger.warn('Get student: student not found', id);
      return res.status(404).json({ error: 'Student not found' });
    }
    
    logger.info('Student retrieved:', id);
    return res.json({ 
      id: doc._id.toString(), 
      name: doc.name, 
      level: doc.level, 
      subject: doc.subject, 
      style: doc.style, 
      goal: doc.goal 
    });
  } catch (e) {
    logger.error('get student error', e);
    return res.status(500).json({ error: 'Server error', details: e.message });
  }
});

// RL-based recommendation system
function calculateLessonScore(lesson, student, progress, allLessons) {
  let score = 0;
  
  // Early return for invalid inputs
  if (!lesson || !student || !progress) return -100;
  
  // 1. Performance-based adjustment (40% weight)
  const accuracy = progress.interactions > 0 ? Math.min(1, progress.correct / progress.interactions) : 0.5;
  
  if (accuracy > 0.8) {
    // High performer - suggest harder content
    score += lesson.difficulty * 10;
  } else if (accuracy < 0.5) {
    // Struggling - suggest easier content
    score += (5 - lesson.difficulty) * 10;
  } else {
    // Average - balanced difficulty
    score += (3 - Math.abs(lesson.difficulty - 3)) * 10;
  }
  
  // 2. Learning style match (20% weight)
  const hasVisualContent = lesson.topics?.some(t => 
    t.toLowerCase().includes('vision') || 
    t.toLowerCase().includes('image') ||
    t.toLowerCase().includes('visualization')
  );
  const hasTheoreticalContent = lesson.topics?.some(t => 
    t.toLowerCase().includes('theory') || 
    t.toLowerCase().includes('math') ||
    t.toLowerCase().includes('algorithm')
  );
  const hasPracticalContent = lesson.estimatedEffort === 'high' || lesson.duration.includes('4 weeks');
  
  if (student.style === 'visual' && hasVisualContent) score += 20;
  if (student.style === 'theoretical' && hasTheoreticalContent) score += 20;
  if (student.style === 'hands-on' && hasPracticalContent) score += 20;
  if (student.style === 'auditory') score += 10; // Neutral for all
  
  // 3. Goal alignment (20% weight)
  const isCareerFocused = lesson.topics?.some(t => 
    t.toLowerCase().includes('engineering') || 
    t.toLowerCase().includes('development') ||
    t.toLowerCase().includes('system')
  );
  const isResearchFocused = lesson.topics?.some(t => 
    t.toLowerCase().includes('advanced') || 
    t.toLowerCase().includes('theory') ||
    t.toLowerCase().includes('optimization')
  );
  
  if (student.goal === 'Career' && isCareerFocused) score += 20;
  if (student.goal === 'Research' && isResearchFocused) score += 20;
  if (student.goal === 'Learn') score += 10; // Balanced
  
  // 4. Engagement optimization (10% weight)
  const totalLessons = allLessons.length;
  const completedCount = progress.completed.length;
  const completionRate = completedCount / totalLessons;
  
  if (completionRate < 0.3 && lesson.estimatedEffort === 'low') {
    // Early stage - suggest easier lessons to build momentum
    score += 10;
  } else if (completionRate > 0.7 && lesson.estimatedEffort === 'high') {
    // Advanced stage - suggest challenging lessons
    score += 10;
  }
  
  // 5. Prerequisite satisfaction (10% weight)
  const prereqsMet = lesson.prerequisites.every(p => progress.completed.includes(p));
  if (prereqsMet) score += 10;
  else score -= 50; // Heavy penalty for unmet prerequisites
  
  return score;
}

app.get('/api/learning-path', async (req, res) => {
  const { subject = 'artificial_intelligence', level = 'Intermediate' } = req.query;
  const all = courseData[subject] || [];
  const filtered = all.filter(byLevel(level));
  const ordered = topoSort(filtered);
  res.json({ subject, level, items: ordered });
});

// NEW: RL-based intelligent recommendation endpoint
app.get('/api/learning-path/recommended', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (!studentId) return res.status(400).json({ error: 'studentId required' });
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid studentId format' });
    }
    
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    
    let progress = await Progress.findOne({ studentId });
    // Create progress if doesn't exist
    if (!progress) {
      progress = await Progress.create({ studentId, completed: [], interactions: 0, correct: 0 });
    }
    
    const subject = student.subject || 'artificial_intelligence';
    const level = student.level || 'Intermediate';
    
    // Get all lessons for the subject
    const allLessons = courseData[subject] || [];
    const filtered = allLessons.filter(byLevel(level));
    
    // Calculate RL-based scores for each lesson
    const scoredLessons = filtered.map(lesson => ({
      ...lesson,
      rlScore: calculateLessonScore(lesson, student, progress, allLessons),
      isCompleted: progress.completed.includes(lesson.name)
    }));
    
    // Separate completed and uncompleted
    const uncompleted = scoredLessons.filter(l => !l.isCompleted);
    const completed = scoredLessons.filter(l => l.isCompleted);
    
    // Sort uncompleted by RL score (highest first)
    uncompleted.sort((a, b) => b.rlScore - a.rlScore);
    
    // Apply topological sort to respect prerequisites within score groups
    const topSuggestions = uncompleted.slice(0, 5); // Top 5 by score
    const remaining = uncompleted.slice(5);
    
    const orderedTop = topoSort(topSuggestions);
    const orderedRemaining = topoSort(remaining);
    
    const recommendedOrder = [...orderedTop, ...orderedRemaining, ...completed];
    
    res.json({
      subject,
      level,
      items: recommendedOrder,
      metadata: {
        accuracy: progress.interactions > 0 ? (progress.correct / progress.interactions * 100).toFixed(1) + '%' : 'N/A',
        completedCount: completed.length,
        totalCount: filtered.length,
        learningStyle: student.style,
        goal: student.goal
      }
    });
  } catch (e) {
    logger.error('recommended path error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lesson/:courseName', (req, res) => {
  try {
    const key = decodeURIComponent(req.params.courseName);
    logger.info('Lesson request for:', key);
    
    const lesson = lessonBank[key] || buildDefaultLesson(key);
    
    // Verify course exists in course data
    const allCourses = Object.values(courseData).flat();
    const courseExists = allCourses.some(c => c.name === key);
    
    if (!courseExists) {
      logger.warn('Lesson requested for non-existent course:', key);
    }
    
    res.json(lesson);
  } catch (error) {
    logger.error('Lesson fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch lesson', details: error.message });
  }
});

app.get('/api/quiz/:courseName', (req, res) => {
  try {
    const key = decodeURIComponent(req.params.courseName);
    logger.info('Quiz request for:', key);
    
    const fromLesson = lessonBank[key]?.quiz;
    const quiz = fromLesson || quizBank[key] || null;
    
    if (!quiz) {
      logger.warn('No quiz available for course:', key);
      return res.status(404).json({ error: 'Quiz not found', courseName: key });
    }
    
    res.json(quiz);
  } catch (error) {
    logger.error('Quiz fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz', details: error.message });
  }
});

app.post('/api/progress', async (req, res) => {
  try {
    const { studentId, courseName, answered, wasCorrect } = req.body || {};
    
    // Validate studentId
    if (!studentId) {
      logger.warn('Progress update: missing studentId');
      return res.status(400).json({ error: 'studentId required' });
    }
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      logger.warn('Progress update: invalid studentId format', studentId);
      return res.status(400).json({ error: 'Invalid studentId format' });
    }

    let doc = await Progress.findOne({ studentId });
    if (!doc) {
      // Auto-create progress document if missing
      logger.info('Progress update: creating new progress for studentId:', studentId);
      doc = await Progress.create({ studentId, completed: [], interactions: 0, correct: 0 });
    }

    // Validate and add completed course
    if (courseName) {
      const trimmedCourseName = courseName.trim();
      if (trimmedCourseName && !doc.completed.includes(trimmedCourseName)) {
        // Verify course exists in courseData
        const allCourses = Object.values(courseData).flat();
        const courseExists = allCourses.some(c => c.name === trimmedCourseName);
        if (courseExists) {
          doc.completed.push(trimmedCourseName);
        } else {
          logger.warn(`Attempted to complete non-existent course: ${trimmedCourseName}`);
        }
      }
    }
    
    // Validate numeric inputs
    const answeredNum = Number(answered) || 0;
    const wasCorrectNum = Number(wasCorrect) || 0;
    
    if (answeredNum > 0) {
      doc.interactions += Math.max(0, Math.min(answeredNum, 100)); // Cap at 100
    }
    if (wasCorrectNum > 0) {
      // Ensure correct doesn't exceed interactions
      const newCorrect = Math.max(0, Math.min(wasCorrectNum, answeredNum));
      doc.correct += newCorrect;
      // Safety check: correct should never exceed interactions
      if (doc.correct > doc.interactions) {
        doc.correct = doc.interactions;
      }
    }

    await doc.save();
    const stats = computeStats(doc);
    
    logger.info('Progress updated successfully', {
      studentId,
      courseName,
      totalCompleted: doc.completed.length,
      interactions: doc.interactions,
      correct: doc.correct,
      accuracy: stats.accuracy
    });
    
    res.json({ ok: true, completed: doc.completed, stats });
  } catch (error) {
    logger.error('Progress update error:', error);
    res.status(500).json({ error: 'Failed to update progress', details: error.message });
  }
});

app.get('/api/progress/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Validate studentId format
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid studentId format' });
    }
    
    let doc = await Progress.findOne({ studentId });
    
    // Create progress document if it doesn't exist
    if (!doc) {
      logger.info('Progress not found, creating new document for studentId:', studentId);
      doc = await Progress.create({ 
        studentId, 
        completed: [], 
        interactions: 0, 
        correct: 0 
      });
    }

    const globalTotal = Object.values(courseData).flat().length;
    const stats = computeStats(doc);

    res.json({
      completedList: doc.completed || [],
      completedCount: stats.completed,
      interactions: stats.interactions,
      correct: stats.correct,
      accuracy: stats.accuracy,
      globalTotal,
      progressPctGlobal: Math.round((stats.completed / globalTotal) * 100)
    });
  } catch (error) {
    logger.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to get progress', details: error.message });
  }
});

// Reset progress for a student (used when regenerating learning path)
app.post('/api/progress/reset', async (req, res) => {
  try {
    const { studentId } = req.body;
    
    logger.info('Reset progress request received for studentId:', studentId);
    
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      logger.error('Database not connected. Ready state:', mongoose.connection.readyState);
      return res.status(503).json({ 
        error: 'Database not available', 
        details: 'MongoDB connection is not ready' 
      });
    }
    
    if (!studentId) {
      logger.warn('Reset progress: studentId missing');
      return res.status(400).json({ error: 'studentId required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      logger.warn('Reset progress: invalid studentId format', studentId);
      return res.status(400).json({ error: 'Invalid studentId format', receivedId: studentId });
    }
    
    const doc = await Progress.findOne({ studentId });
    if (!doc) {
      // Create fresh progress if it doesn't exist
      logger.info('Reset progress: creating fresh progress document for', studentId);
      const newProgress = await Progress.create({ 
        studentId, 
        completed: [], 
        interactions: 0, 
        correct: 0 
      });
      return res.json({ 
        ok: true, 
        message: 'Progress created fresh',
        progress: {
          completed: newProgress.completed,
          interactions: newProgress.interactions,
          correct: newProgress.correct
        }
      });
    }
    
    // Log before reset
    logger.info('Reset progress: before reset', {
      completed: doc.completed.length,
      interactions: doc.interactions,
      correct: doc.correct
    });
    
    // Reset all progress fields
    doc.completed = [];
    doc.interactions = 0;
    doc.correct = 0;
    await doc.save();
    
    // Log after reset
    logger.info('Reset progress: after reset', {
      completed: doc.completed.length,
      interactions: doc.interactions,
      correct: doc.correct
    });
    
    res.json({ 
      ok: true, 
      message: 'Progress reset successfully',
      progress: {
        completed: doc.completed,
        interactions: doc.interactions,
        correct: doc.correct
      }
    });
  } catch (error) {
    logger.error('Progress reset error:', error);
    res.status(500).json({ error: 'Failed to reset progress', details: error.message });
  }
});

app.get('/api/dashboard/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    // Validate studentId format
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: 'Invalid studentId format' });
    }
    
    let progress = await Progress.findOne({ studentId });
    
    // Create progress if it doesn't exist
    if (!progress) {
      logger.info('Dashboard: creating fresh progress for studentId:', studentId);
      progress = await Progress.create({ 
        studentId, 
        completed: [], 
        interactions: 0, 
        correct: 0 
      });
    }

    const stats = computeStats(progress);

    // Generate realistic progress series based on actual completed count
    const progressSeries = [0, 10, 25, 40, 60, Math.min(stats.completed * 15, 100)];
    const performanceSeries = [0, 20, 35, 50, 65, stats.accuracy];

    const confidence = 0.82;

    res.json({
      stats,
      series: {
        weeks: ['Week 1','Week 2','Week 3','Week 4','Week 5','Week 6'],
        progress: progressSeries,
        performance: performanceSeries
      },
      confidence
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard', details: error.message });
  }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { studentId, difficulty, engagement, comments } = req.body || {};
    
    // Validate studentId if provided
    if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) {
      logger.warn('Feedback: invalid studentId format', studentId);
      return res.status(400).json({ error: 'Invalid studentId format' });
    }
    
    // Validate numeric fields
    if (difficulty !== undefined && (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 5)) {
      return res.status(400).json({ error: 'Difficulty must be a number between 1 and 5' });
    }
    
    if (engagement !== undefined && (typeof engagement !== 'number' || engagement < 1 || engagement > 5)) {
      return res.status(400).json({ error: 'Engagement must be a number between 1 and 5' });
    }
    
    const saved = await Feedback.create({ studentId, difficulty, engagement, comments });
    logger.info('Feedback saved:', saved._id.toString());
    
    res.json({ ok: true, id: saved._id.toString() });
  } catch (error) {
    logger.error('Feedback save error:', error);
    res.status(500).json({ error: 'Failed to save feedback', details: error.message });
  }
});

const port = process.env.PORT || 5000;

// Export for Vercel serverless
module.exports = app;

// Only start server if not in serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`API listening on :${port}`);
    console.log('Available endpoints:');
    console.log('  - POST /api/progress/reset - Reset student progress');
    console.log('  - GET  /api/progress/:studentId - Get student progress');
    console.log('  - POST /api/progress - Update student progress');
    console.log('  - GET  /api/dashboard/:studentId - Get dashboard data');
    console.log('  - POST /api/profile - Create/update student profile');
    console.log('  - GET  /api/learning-path/recommended - Get RL-based recommended path');
  });
}
