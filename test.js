const http = require('http');

const data = JSON.stringify({
  text: "Artificial intelligence is intelligence demonstrated by machines, as opposed to intelligence of humans and other animals. Example tasks in which this is done include speech recognition, computer vision, translation between (natural) languages, as well as other mappings of inputs. AI applications include advanced web search engines, recommendation systems, understanding human speech, self-driving cars, generative or creative tools, and competing at the highest level in strategic game systems."
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/ai/summarize',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  let chunks = '';
  res.on('data', d => {
    chunks += d;
  });
  res.on('end', () => {
    console.log(chunks);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
