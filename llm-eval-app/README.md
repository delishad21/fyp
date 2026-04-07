# LLM Evaluation App

Lightweight web interface (built on Vite) for running AI quiz generation test runs and collecting automatic metrics. Latches onto running AI and user service.

## Env Setup

- `VITE_AI_SVC_URL=http://localhost:7304`
- `VITE_USER_SVC_URL=http://localhost:7301`
- `VITE_TEACHER_IDENTIFIER=<teacher username/email>`
- `VITE_TEACHER_PASSWORD=<teacher password>`
- `VITE_AI_ANALYTICS_SECRET=<matches AI_ANALYTICS_SECRET in ai-service env>`
- `VITE_AUTO_LOGIN=true`
