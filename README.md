
# Presence - Facial Recognition Attendance System

## Project info

An advanced attendance management system powered by facial recognition technology.

## Features

- Real-time attendance tracking with facial recognition
- Dashboard with attendance analytics and insights
- User registration and management
- Secure authentication
- Department-based tracking and reporting

## Technologies Used

- React
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Supabase for backend and authentication
- Face-api.js for facial recognition

## Getting Started

Follow these steps to get the project running locally:

```sh
# Step 1: Clone the repository
git clone <REPOSITORY_URL>

# Step 2: Navigate to the project directory
cd presence

# Step 3: Install the necessary dependencies
npm i

# Step 4: Create a .env file with your environment variables
# Use .env.example as a template

# Step 5: Start the development server
npm run dev
```

## Deployment on Vercel

### Required Environment Variables

Make sure to set the following environment variables in your Vercel project settings:

VITE_SUPABASE_URL=https://ulqeiwqodhltoibeqzlp.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVscWVpd3FvZGhsdG9pYmVxemxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNzA5MjgsImV4cCI6MjA1Njc0NjkyOH0.tEcTfAx4nisb_SaHE1GNAEcfLwbLgNJMXHrTw8wpGw0

VITE_FIREBASE_API_KEY=AIzaSyBRNd3qMSYy4J6GnRajnM7sQPqKMmtOSRI
VITE_FIREBASE_AUTH_DOMAIN=face-attendance-ed516.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=face-attendance-ed516
VITE_FIREBASE_STORAGE_BUCKET=face-attendance-ed516.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=823123600366
VITE_FIREBASE_APP_ID=1:823123600366:web:6eaac2a3fa8cf9429dca85

### Deploy to Vercel

1. Push your code to a GitHub repository
2. Log in to Vercel and create a new project
3. Import your GitHub repository
4. Configure the environment variables
5. Deploy!

## Made by Gaurav

© 2024 Presence. All rights reserved.
