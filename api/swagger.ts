import express from 'express';
import cors from 'cors';
import swaggerRouter from '../backend/api/swagger';

const app = express();
app.use(cors());
app.use(express.json());
app.use(swaggerRouter);

export default app;
