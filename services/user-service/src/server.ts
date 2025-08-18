import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => {
    res.send('Hello from user-service!');
});

app.listen(port, () => {
    console.log(`user-service running on port ${port}`);
});
