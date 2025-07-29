require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const tabelas = [
  "cereais_e_tuberculos",
  "frutas",
  "gorduras",
  "leguminosas",
  "leite_e_derivados",
  "proteina",
  "sementes",
  "verduras__hortali_as_e_derivados",
];

// Rota raiz para teste simples
app.get("/", (req, res) => {
  res.send("Backend online 🚀");
});

// Função para buscar alimento
async function buscarAlimento(nomeAlimento) {
  const nomeLower = nomeAlimento.toLowerCase().trim();

  for (const tabela of tabelas) {
    try {
      const alimentos = await prisma[tabela].findMany({
        select: { Alimento: true, Energia__Kcal_: true, Quantidade__g_: true },
      });

      if (!alimentos || alimentos.length === 0) continue;

      const alimentoEncontrado = alimentos.find((alimento) =>
        alimento.Alimento && alimento.Alimento.toLowerCase().includes(nomeLower)
      );

      if (alimentoEncontrado) {
        return { ...alimentoEncontrado, grupo: tabela };
      }
    } catch (error) {
      console.error(`Erro ao buscar na tabela ${tabela}:`, error);
    }
  }

  return null;
}

// Rota para sugestões
app.get("/api/sugestoes", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "O parâmetro 'query' é obrigatório" });
  }

  const nomeLower = query.toLowerCase().trim();
  let resultados = [];

  try {
    for (const tabela of tabelas) {
      const alimentos = await prisma[tabela].findMany({
        where: {
          Alimento: {
            contains: nomeLower,
          },
        },
        select: { Alimento: true },
        take: 10,
      });

      resultados = [...resultados, ...alimentos.map((a) => a.Alimento)];
    }

    if (resultados.length === 0) {
      return res.status(404).json({ error: "Nenhum alimento encontrado" });
    }

    res.json({ sugestoes: resultados });
  } catch (error) {
    console.error("Erro ao buscar sugestões:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// Rota para equivalência
app.get("/api/equivalencia", async (req, res) => {
  const { baseFood, baseQuantity, substituteFood } = req.query;

  if (!baseFood || !baseQuantity || !substituteFood) {
    return res.status(400).json({ error: "Parâmetros inválidos" });
  }

  try {
    const base = await buscarAlimento(baseFood);
    const substitute = await buscarAlimento(substituteFood);

    if (!base || !substitute) {
      return res.status(404).json({ error: "Alimento não encontrado" });
    }

    const baseCalories = base.Energia__Kcal_ || base.Calorias || base.Kcal;
    const substituteCalories = substitute.Energia__Kcal_ || substitute.Calorias || substitute.Kcal;

    if (!baseCalories || !substituteCalories) {
      return res.status(500).json({ error: "Erro ao obter calorias dos alimentos" });
    }

    const equivalentQuantity = (baseQuantity * baseCalories) / substituteCalories;

    res.json({
      baseFood,
      baseQuantity,
      substituteFood,
      equivalentQuantity: equivalentQuantity.toFixed(2),
      baseGroup: base.grupo,
      substituteGroup: substitute.grupo,
    });
  } catch (error) {
    console.error("Erro ao buscar equivalência:", error);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// Teste de conexão com banco
async function testDatabase() {
  for (const tabela of tabelas) {
    try {
      await prisma[tabela].findFirst();
      console.log(`✅ Conexão com ${tabela} bem-sucedida!`);
    } catch (error) {
      console.error(`❌ Erro ao conectar com ${tabela}:`, error);
    }
  }
}

testDatabase();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
