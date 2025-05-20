const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config(); // <- Carrega as variáveis do .env

const app = express();
const prisma = new PrismaClient();

// Log para confirmar que a variável foi lida corretamente
console.log("DATABASE_URL:", process.env.DATABASE_URL);

app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
