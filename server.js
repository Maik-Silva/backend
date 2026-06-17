require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Chave secreta para criptografia do Token JWT
const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_padrao_equivale_saas";

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

// ==========================================
//          ROTAS DE AUTENTICAÇÃO
// ==========================================

// 1. Rota para Registrar um Novo Nutricionista
app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha, crn } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    // Verifica se o e-mail já existe na tabela de nutricionistas
    const usuarioExiste = await prisma.nutricionistas.findUnique({
      where: { email },
    });

    if (usuarioExiste) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }

    // Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);

    // Cria o nutricionista no MySQL
    const novoNutri = await prisma.nutricionistas.create({
      data: {
        nome,
        email,
        senha_hash,
        crn: crn || null,
        plano: "free",
        ativo: true,
      },
    });

    res.status(201).json({
      message: "Nutricionista cadastrado com sucesso!",
      id: novoNutri.id,
    });
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({ error: "Erro interno ao cadastrar nutricionista." });
  }
});

// 2. Rota para Login do Nutricionista
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    // Busca o nutricionista pelo e-mail
    const nutri = await prisma.nutricionistas.findUnique({
      where: { email },
    });

    if (!nutri) {
      return res.status(400).json({ error: "Credenciais inválidas." });
    }

    // Compara a senha digitada com o hash salvo no banco
    const senhaCorreta = await bcrypt.compare(senha, nutri.senha_hash);
    if (!senhaCorreta) {
      return res.status(400).json({ error: "Credenciais inválidas." });
    }

    // Verifica se a conta está ativa
    if (!nutri.ativo) {
      return res.status(403).json({ error: "Sua conta está inativa. Contate o suporte." });
    }

    // Gera o token JWT válido por 7 dias
    const token = jwt.sign(
      { id: nutri.id, email: nutri.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Retorna o token e os dados públicos do nutricionista para o Front-end
    res.json({
      token,
      nutricionista: {
        id: nutri.id,
        nome: nutri.nome,
        email: nutri.email,
        crn: nutri.crn,
        plano: nutri.plano,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao realizar login." });
  }
});

// ==========================================
//          ROTAS ALIMENTARES EXISTENTES
// ==========================================

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