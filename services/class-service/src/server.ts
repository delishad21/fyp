import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => {
    res.send('Hello from class-service!');
});

app.listen(port, () => {
    console.log(`class-service running on port ${port}`);
});
