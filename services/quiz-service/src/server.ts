import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => {
    res.send('Hello from quiz-service!');
});

app.listen(port, () => {
    console.log(`quiz-service running on port ${port}`);
});
