import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => {
    res.send('Hello from reward-service!');
});

app.listen(port, () => {
    console.log(`reward-service running on port ${port}`);
});
