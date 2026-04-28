# LLM Evaluation App

Lightweight web interface (built on Vite) for running AI quiz generation test runs and collecting automatic metrics. Latches onto running AI and user service (directly or through gateway).

## Env Setup

- `VITE_AI_SVC_URL=http://localhost:8085/api/ai` (prod stack through gateway)
- `VITE_USER_SVC_URL=http://localhost:8085/api/user` (prod stack through gateway)
- `VITE_TEACHER_IDENTIFIER=<teacher username/email>`
- `VITE_TEACHER_PASSWORD=<teacher password>`
- `VITE_AI_ANALYTICS_SECRET=<matches AI_ANALYTICS_SECRET in ai-service env>`
- `VITE_AUTO_LOGIN=true`
