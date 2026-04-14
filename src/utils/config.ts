import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3000,

  allowedOrigins: process.env.ALLOW_ORIGIN 
    ? process.env.ALLOW_ORIGIN.split(",") 
    : [],

  musicOpen: process.env.MUSIC === 'open',

  avatarOpen: process.env.AVATAR === 'open',
  
} as const; 