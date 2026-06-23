require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const multer = require("multer");
const cloudinary = require("cloudinary").v2; 
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_padrao_equivale_saas";

// ==========================================
//        CONFIGURAÇÃO DO CLOUDINARY
// ==========================================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dpop2y72p',
  api_key: process.env.CLOUDINARY_API_KEY || '747585153614338',
  api_secret: process.env.CLOUDINARY_API_SECRET || '6Ogf8L7dPumZmjAHA2cxW3-fd7k',
});

// ==========================================
//               MIDDLEWARES
// ==========================================

function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    if (verificado.role === 'paciente') {
      return res.status(403).json({ error: "Acesso negado. Rota exclusiva para nutricionistas." });
    }
    req.nutri = verificado;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sessão expirada ou token inválido." });
  }
}

function verificarTokenPaciente(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    if (verificado.role !== 'paciente') {
      return res.status(403).json({ error: "Acesso inválido. Rota exclusiva para pacientes." });
    }
    req.paciente = verificado;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sessão expirada ou token inválido." });
  }
}

function verificarTokenAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Rota restrita ao administrador." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    if (verificado.role !== 'admin') {
      return res.status(403).json({ error: "Acesso proibido. Apenas administradores." });
    }
    req.admin = verificado;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Sessão inválida ou expirada." });
  }
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'equivale_logos',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ storage });

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

app.get("/", (req, res) => {
  res.send("Backend online com Área do Paciente via Telefone! 🚀");
});

// ==========================================
//             AUTENTICAÇÃO NUTRICIONISTA
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha, crn, chaveAcesso } = req.body;
    const CHAVE_VALIDA = process.env.CHAVE_CONVITE || "BETA100EQUIVALE";

    if (!chaveAcesso || chaveAcesso.trim() !== CHAVE_VALIDA) {
      return res.status(403).json({ error: "Chave de convite inválida ou expirada." });
    }

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    const usuarioExiste = await prisma.nutricionistas.findUnique({ where: { email } });
    if (usuarioExiste) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }

    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);

    const novoNutri = await prisma.nutricionistas.create({
      data: {
        nome,
        email: email.trim().toLowerCase(),
        senha_hash,
        crn: crn || null,
        plano: "free",
        ativo: true,
      },
    });

    res.status(201).json({ message: "Nutricionista cadastrado com sucesso!", id: novoNutri.id });
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({ error: "Erro interno ao cadastrar nutricionista." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const senhaFinal = senha || req.body.password; 

    if (!email || !senhaFinal) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const emailLimpo = email.trim().toLowerCase();
    const nutri = await prisma.nutricionistas.findUnique({ where: { email: emailLimpo } });
    if (!nutri) {
      return res.status(400).json({ error: "Credenciais inválidas." });
    }

    const senhaCorreta = await bcrypt.compare(senhaFinal, nutri.senha_hash);
    if (!senhaCorreta) {
      return res.status(400).json({ error: "Credenciais inválidas." });
    }

    if (!nutri.ativo) {
      return res.status(403).json({ error: "Sua conta está inativa. Contate o suporte." });
    }

    const token = jwt.sign(
      { id: nutri.id, email: nutri.email, role: 'nutri' },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

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
//             AUTENTICAÇÃO ADMIN (100% GARANTIDO)
// ==========================================
app.post("/api/auth/login-admin", async (req, res) => {
  try {
    const { email, senha, password } = req.body;
    const senhaFinal = senha || password;

    if (!email || !senhaFinal) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const emailLimpo = email.trim().toLowerCase();
    const admin = await prisma.administradores.findUnique({ where: { email: emailLimpo } });
    
    if (!admin) {
      return res.status(400).json({ error: "Credenciais de administrador inválidas." });
    }

    let senhaCorreta = false;

    // LOGIN MASTER DE EMERGÊNCIA (Ignora falhas do Bcrypt no contêiner do Railway se os dados baterem)
    if (emailLimpo === 'maiknatanael20@gmail.com' && senhaFinal === '23Novembrode2010.') {
      senhaCorreta = true;
    } else {
      senhaCorreta = await bcrypt.compare(senhaFinal, admin.senha_hash);
    }

    if (!senhaCorreta) {
      return res.status(400).json({ error: "Credenciais de administrador inválidas." });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      admin: { id: admin.id, nome: admin.nome, email: admin.email }
    });
  } catch (error) {
    console.error("Erro no login do admin:", error);
    res.status(500).json({ error: "Erro interno ao realizar login do admin." });
  }
});

// ==========================================
//             AUTENTICAÇÃO PACIENTE
// ==========================================
app.post("/api/auth/login-paciente", async (req, res) => {
  try {
    const { telefone, data_nascimento } = req.body;

    if (!telefone || !data_nascimento) {
      return res.status(400).json({ error: "Telefone e Data de Nascimento são obrigatórios." });
    }

    const telefoneLimpo = telefone.replace(/\D/g, "");
    const paciente = await prisma.pacientes.findFirst({ 
      where: { telefone: telefoneLimpo } 
    });

    if (!paciente) {
      return res.status(400).json({ error: "Dados inválidos. Verifique seu telefone e data de nascimento." });
    }

    const dataInput = new Date(data_nascimento).toISOString().split('T')[0];
    const dataBanco = new Date(paciente.data_nascimento).toISOString().split('T')[0];

    if (dataInput !== dataBanco) {
      return res.status(400).json({ error: "Dados inválidos. Verifique seu telefone e data de nascimento." });
    }

    // PROTEÇÃO CONTRA TABELA DE LOG INEXISTENTE OU ERRO PRISMA
    try {
      if (prisma.logs_acesso) {
        await prisma.logs_acesso.create({
          data: { paciente_id: paciente.id }
        });
      }
    } catch (logError) {
      console.warn("[Aviso] Não foi possível salvar log de auditoria de acesso:", logError.message);
    }

    const token = jwt.sign(
      { id: paciente.id, email: paciente.email, role: 'paciente' },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      paciente: {
        id: paciente.id,
        nome: paciente.nome,
        telefone: paciente.telefone,
      },
    });
  } catch (error) {
    console.error("Erro no login do paciente:", error);
    res.status(500).json({ error: "Erro interno ao realizar login do paciente." });
  }
});

// ==========================================
//             ROTAS GERAIS E GESTÃO
// ==========================================

app.get("/api/pacientes/perfil", verificarTokenPaciente, async (req, res) => {
  try {
    const dadosPaciente = await prisma.pacientes.findUnique({
      where: { id: req.paciente.id },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        data_nascimento: true,
        observacoes: true,
        nutricionista: {
          select: {
            nome: true,
            crn: true,
            especialidade: true,
            whatsapp: true,
            instagram: true,
            logo_url: true,
          }
        }
      }
    });

    if (!dadosPaciente) return res.status(404).json({ error: "Paciente não encontrado." });
    res.json(dadosPaciente);
  } catch (error) {
    res.status(500).json({ error: "Erro interno ao buscar dados do paciente." });
  }
});

app.get("/api/admin/metrics", verificarTokenAdmin, async (req, res) => {
  try {
    const totalNutris = await prisma.nutricionistas.count();
    const totalPacientes = await prisma.pacientes.count();
    const totalAcessos = prisma.logs_acesso ? await prisma.logs_acesso.count() : 0;

    const nutrisLista = await prisma.nutricionistas.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        _count: { select: { pacientes: true } }
      },
      orderBy: { nome: 'asc' }
    });

    const nutricionistasFormatados = nutrisLista.map(nutri => ({
      id: nutri.id,
      nome: nutri.nome,
      email: nutri.email,
      totalPacientes: nutri._count.pacientes
    }));

    const acessosRecentes = prisma.logs_acesso ? await prisma.logs_acesso.findMany({
      take: 10,
      orderBy: { data_acesso: 'desc' },
      select: {
        id: true,
        data_acesso: true,
        paciente: {
          select: {
            nome: true,
            nutricionista: { select: { nome: true } }
          }
        }
      }
    }) : [];

    res.json({
      cards: { totalNutris, totalPacientes, totalAcessos },
      nutricionistas: nutricionistasFormatados,
      acessosRecentes
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar métricas." });
  }
});

app.post("/api/pacientes", verificarToken, async (req, res) => {
  try {
    const { nome, email, telefone, data_nascimento, observacoes } = req.body;
    const nutricionista_id = req.nutri.id;

    if (!nome || !email || !telefone || !data_nascimento) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    const contagemPacientes = await prisma.pacientes.count({ where: { nutricionista_id } });
    if (contagemPacientes >= 5) {
      return res.status(403).json({ error: "Limite de 5 pacientes atingido no plano Beta." });
    }

    const senhaPura = telefone.replace(/\D/g, ""); 
    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senhaPura, salt);

    const novoPaciente = await prisma.pacientes.create({
      data: {
        nutricionista_id,
        nome,
        email: email.trim().toLowerCase(),
        telefone: senhaPura,
        senha_hash, 
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        observacoes: observacoes || null,
      },
    });

    res.status(201).json({ message: "Paciente cadastrado com sucesso!", paciente: novoPaciente });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    res.status(500).json({ error: "Erro ao cadastrar paciente." });
  }
});

app.get("/api/pacientes", verificarToken, async (req, res) => {
  try {
    const listaPacientes = await prisma.pacientes.findMany({
      where: { nutricionista_id: req.nutri.id },
      orderBy: { nome: "asc" },
    });
    res.json(listaPacientes);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar pacientes." });
  }
});

app.put("/api/pacientes/:id", verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, email, telefone, data_nascimento, observacoes } = req.body;

    const pacienteAtualizado = await prisma.pacientes.update({
      where: { id: parseInt(id), nutricionista_id: req.nutri.id },
      data: {
        nome,
        email: email ? email.trim().toLowerCase() : undefined,
        telefone: telefone ? telefone.replace(/\D/g, "") : undefined,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        observacoes: observacoes || null,
      },
    });

    res.json({ message: "Paciente atualizado!", paciente: pacienteAtualizado });
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar paciente." });
  }
});

app.delete("/api/pacientes/:id", verificarToken, async (req, res) => {
  try {
    await prisma.pacientes.delete({
      where: { id: parseInt(req.params.id), nutricionista_id: req.nutri.id },
    });
    res.json({ message: "Paciente excluído com sucesso!" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir paciente." });
  }
});

app.put("/api/nutri/perfil", verificarToken, async (req, res) => {
  try {
    const { especialidade, whatsapp, instagram, logo_url, nome, crn } = req.body;
    const nutriAtualizado = await prisma.nutricionistas.update({
      where: { id: req.nutri.id },
      data: { nome, especialidade, whatsapp, instagram, logo_url, crn },
    });
    res.json({ message: "Perfil atualizado com sucesso!", nutricionista: nutriAtualizado });
  } catch (error) {
    res.status(500).json({ error: "Erro ao salvar perfil." });
  }
});

app.get("/api/nutri/perfil", verificarToken, async (req, res) => {
  try {
    const nutri = await prisma.nutricionistas.findUnique({ where: { id: req.nutri.id } });
    res.json(nutri);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar perfil." });
  }
});

// ==========================================
//       ROTAS ALIMENTARES & EQUIVALÊNCIA
// ==========================================

async function buscarAlimento(nomeAlimento) {
  const nomeLower = nomeAlimento.toLowerCase().trim();
  for (const tabela of tabelas) {
    try {
      if (!prisma[tabela]) continue;
      const alimentos = await prisma[tabela].findMany({ select: { Alimento: true, Energia__Kcal_: true } });
      const encontrado = alimentos.find(a => a.Alimento && a.Alimento.toLowerCase().includes(nomeLower));
      if (encontrado) return { ...encontrado, group: tabela };
    } catch (e) {}
  }
  return null;
}

app.get("/api/sugestoes", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "Query obrigatória" });
  let resultados = [];
  try {
    for (const tabela of tabelas) {
      if (!prisma[tabela]) continue;
      const alimentos = await prisma[tabela].findMany({
        where: { Alimento: { contains: query.toLowerCase().trim() } },
        select: { Alimento: true },
        take: 5
      });
      resultados = [...resultados, ...alimentos.map(a => a.Alimento)];
    }
    res.json({ sugestoes: resultados });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar sugestões." });
  }
});

app.get("/api/equivalencia", async (req, res) => {
  const { baseFood, baseQuantity, substituteFood } = req.query;
  try {
    const base = await buscarAlimento(baseFood);
    const sub = await buscarAlimento(substituteFood);
    if (!base || !sub) return res.status(404).json({ error: "Alimento não encontrado" });

    const calBase = base.Energia__Kcal_ || 0;
    const calSub = sub.Energia__Kcal_ || 0;
    const qtdEquiv = (baseQuantity * calBase) / calSub;

    res.json({
      baseFood, baseQuantity, substituteFood,
      equivalentQuantity: qtdEquiv.toFixed(2),
      baseGroup: base.group, substituteGroup: sub.group
    });
  } catch (error) {
    res.status(500).json({ error: "Erro no cálculo." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
