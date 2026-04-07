# Ember

This repository contains the full stack for my final year project (Gamified AI-Powered Mobile Learning Platform), currently codenamed as "Ember". The project is structured into several directories for different components of the system:

- `web-app` for the teacher-facing dashboard
- `phone-app` for the student mobile app
- `services/*` for the backend microservices
- `llm-eval-app` for running AI generation evaluation tasks
- `docs/Developer Guide` and `docs/Final Report` for the supporting documentation

## Project Overview

Ember is built around a quiz workflow for teachers and students. Teachers can create classes, create quizzes, schedule quizzes, use AI to generate content, and track student results. Students use the mobile app to attempt quizzes and view feedback. The backend is split into microservices so the each domain can be developed and scaled independently.

The following directories are the main components of the project:

- `docs/Developer Guide` for API documentation and implementation notes
- `docs/Final Report` for the final report
- `services/*/` for microservice code
- `web-app` for the teacher web client code
- `phone-app` for the student mobile app code
- `llm-eval-app` for the AI evaluation app

## Local Development

The project is usually run with Docker Compose.

- `docker-compose.dev.yml` brings up the full development stack.
- `docker-compose.test.yml` is used for the test/integration setup.
- `setup-project.sh` is the bootstrap script for local setup tasks.

Before starting the stack, make sure the root .env file is configured with the necessary environment variables.
You can copy from `.env.example` and fill in the values.

## Useful Commands

- Start the dev environment: `docker compose -f docker-compose.dev.yml up --build`
- Start the test environment: `docker compose -f docker-compose.test.yml up --build` (used for user testing, essentially a production stack)
