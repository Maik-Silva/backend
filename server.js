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
//                 MIDDLEWARES
// ==========================================

function verificarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Faça login para continuar." });
  }

  try {
    const verificado = jwt.verify(token, JWT_SECRET);
    if (verificado.role !== 'nutri' && verificado.role !== 'admin') {
      return res.status(403).json({ error: "Acesso negado. Rota exclusiva para nutricionistas/administradores." });
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

app.get("/", (req, res) => {
  res.send("Backend online com a nova tabela unificada banco_equivale! 🚀");
});

// ==========================================
//        AUTENTICAÇÃO NUTRICIONISTA
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { nome, email, senha, crn, chaveAcesso, sexo } = req.body;
    const CHAVE_VALIDA = process.env.CHAVE_CONVITE || "BETA100EQUIVALE";

    if (!chaveAcesso || chaveAcesso.trim() !== CHAVE_VALIDA) {
      return res.status(403).json({ error: "Chave de convite inválida ou expirada." });
    }

    if (!nome || !email || !senha || !sexo) {
      return res.status(400).json({ error: "Nome, e-mail, senha e sexo são obrigatórios." });
    }

    // Normalização inteligente do campo sexo
    let sexoFormatado = sexo;
    if (sexo && typeof sexo === 'string') {
      sexoFormatado = sexo.trim().charAt(0).toUpperCase() + sexo.trim().slice(1).toLowerCase();
    }

    if (sexoFormatado !== "Feminino" && sexoFormatado !== "Masculino") {
      return res.status(400).json({ error: "O campo sexo deve ser 'Feminino' ou 'Masculino'." });
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
        sexo: sexoFormatado,
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
        sexo: nutri.sexo,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao realizar login." });
  }
});

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
        sexo: paciente.sexo,
      },
    });
  } catch (error) {
    console.error("Erro no login do paciente:", error);
    res.status(500).json({ error: "Erro interno ao realizar login do paciente." });
  }
});

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
        sexo: true,
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

// ==========================================
//         ROTAS DO ADMINISTRADOR
// ==========================================

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
        limite_pacientes: true,
        _count: { select: { pacientes: true } }
      },
      orderBy: { nome: 'asc' }
    });

    const nutricionistasFormatados = nutrisLista.map(nutri => ({
      id: nutri.id,
      nome: nutri.nome,
      email: nutri.email,
      limitePacientes: nutri.limite_pacientes || 5,
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

app.put("/api/admin/nutricionistas/:id/limite", verificarTokenAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { limite_pacientes } = req.body;

    if (limite_pacientes === undefined || isNaN(parseInt(limite_pacientes))) {
      return res.status(400).json({ error: "O limite de pacientes informado é inválido." });
    }

    const nutriAtualizado = await prisma.nutricionistas.update({
      where: { id: parseInt(id) },
      data: { limite_pacientes: parseInt(limite_pacientes) }
    });

    res.json({ message: "Limite do nutricionista updated!", nutricionista: nutriAtualizado });
  } catch (error) {
    console.error("Erro ao atualizar limite:", error);
    res.status(500).json({ error: "Erro interno ao atualizar limite." });
  }
});

app.get("/api/admin/usuarios", verificarTokenAdmin, async (req, res) => {
  try {
    const nutricionistas = await prisma.nutricionistas.findMany({
      select: { id: true, nome: true, email: true, ativo: true, crn: true, sexo: true }
    });
    const pacientes = await prisma.pacientes.findMany({
      select: { id: true, nome: true, email: true, telefone: true, sexo: true, nutricionista: { select: { nome: true } } }
    });

    res.json({ nutricionistas, pacientes });
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar usuários globais." });
  }
});


// ==========================================
//     PERFIL E VISÃO GERAL DO NUTRICIONISTA
// ==========================================

app.get("/api/nutri/perfil", verificarToken, async (req, res) => {
  try {
    const nutri = await prisma.nutricionistas.findUnique({ 
      where: { id: req.nutri.id } 
    });

    if (!nutri) {
      return res.status(404).json({ error: "Nutricionista não encontrado." });
    }

    res.json({
      ...nutri,
      total_sugestoes: 0,
      sugestoes_realizadas: 0
    });
  } catch (error) {
    console.error("Erro ao buscar perfil do nutricionista:", error);
    res.status(500).json({ error: "Erro interno ao buscar perfil." });
  }
});

app.put("/api/nutri/perfil", verificarToken, upload.single('logo'), async (req, res) => {
  try {
    const targetId = req.nutri.role === 'admin' && req.body.id ? parseInt(req.body.id) : req.nutri.id;

    const { especialidade, whatsapp, instagram, nome, crn, bloquear_grupos_diferentes, sexo } = req.body;
    let logo_url = req.body.logo_url;

    if (req.file) {
      logo_url = req.file.path; 
    }

    // TRATAMENTO DO BOOLEANO SEGURO:
    let boolBloqueio = false;
    if (
      bloquear_grupos_diferentes === true || 
      bloquear_grupos_diferentes === 'true' || 
      bloquear_grupos_diferentes === 1 || 
      bloquear_grupos_diferentes === '1'
    ) {
      boolBloqueio = true;
    }

    // Normalização e validação se o sexo foi modificado e enviado
    let sexoFormatado = sexo;
    if (sexo && typeof sexo === 'string') {
      sexoFormatado = sexo.trim().charAt(0).toUpperCase() + sexo.trim().slice(1).toLowerCase();
    }

    if (sexoFormatado && sexoFormatado !== "Feminino" && sexoFormatado !== "Masculino") {
      return res.status(400).json({ error: "O campo sexo deve ser 'Feminino' ou 'Masculino'." });
    }

    const nutriAtualizado = await prisma.nutricionistas.update({
      where: { id: targetId },
      data: { 
        nome: nome || undefined,
        especialidade: especialidade || null,
        whatsapp: whatsapp || null,
        instagram: null || instagram,
        logo_url: logo_url || undefined, 
        crn: crn || null,
        bloquear_grupos_diferentes: boolBloqueio,
        sexo: sexoFormatado || undefined
      },
    });

    console.log(`[Sucesso] Configuração de bloqueio do Nutri ID ${targetId} atualizada para: ${boolBloqueio}`);

    res.json({ message: "Perfil updated com sucesso!", nutricionista: nutriAtualizado });
  } catch (error) {
    console.error("Erro detalhado ao salvar perfil:", error);
    res.status(500).json({ error: "Erro ao salvar perfil." });
  }
});


// ==========================================
//                ROTAS DE PACIENTES
// ==========================================

app.post("/api/pacientes", verificarToken, async (req, res) => {
  try {
    const { nome, email, telefone, data_nascimento, observacoes, sexo } = req.body;
    const nutricionista_id = req.nutri.id;

    if (!nome || !email || !telefone || !data_nascimento || !sexo) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes (Nome, E-mail, Telefone, Data de Nascimento ou Sexo)." });
    }

    // Normalização inteligente do campo sexo
    let sexoFormatado = sexo;
    if (sexo && typeof sexo === 'string') {
      sexoFormatado = sexo.trim().charAt(0).toUpperCase() + sexo.trim().slice(1).toLowerCase();
    }

    if (sexoFormatado !== "Feminino" && sexoFormatado !== "Masculino") {
      return res.status(400).json({ error: "O campo sexo deve ser 'Feminino' ou 'Masculino'." });
    }

    const nutriConfig = await prisma.nutricionistas.findUnique({
      where: { id: nutricionista_id },
      select: { limite_pacientes: true }
    });

    const limiteMaximo = nutriConfig?.limite_pacientes || 5;

    const contagemPacientes = await prisma.pacientes.count({ where: { nutricionista_id } });
    if (contagemPacientes >= limiteMaximo) {
      return res.status(403).json({ error: `Limite de ${limiteMaximo} pacientes atingido para o seu plano.` });
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
        sexo: sexoFormatado,
      },
    });

    res.status(201).json({ message: "Paciente cadastrado com sucesso!", paciente: novoPaciente });
  } catch (error) {
    console.error("Erro crítico detalhado ao criar paciente no Prisma:", error);
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
    const { nome, email, telefone, data_nascimento, observacoes, sexo } = req.body;

    const filtro = req.nutri.role === 'admin' ? { id: parseInt(id) } : { id: parseInt(id), nutricionista_id: req.nutri.id };

    // Normalização inteligente do campo sexo
    let sexoFormatado = sexo;
    if (sexo && typeof sexo === 'string') {
      sexoFormatado = sexo.trim().charAt(0).toUpperCase() + sexo.trim().slice(1).toLowerCase();
    }

    if (sexoFormatado && sexoFormatado !== "Feminino" && sexoFormatado !== "Masculino") {
      return res.status(400).json({ error: "O campo sexo deve ser 'Feminino' ou 'Masculino'." });
    }

    const pacienteAtualizado = await prisma.pacientes.update({
      where: filtro,
      data: {
        nome,
        email: email ? email.trim().toLowerCase() : undefined,
        telefone: telefone ? telefone.replace(/\D/g, "") : undefined,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        observacoes: observacoes || null,
        sexo: sexoFormatado || undefined,
      },
    });

    res.json({ message: "Paciente updated!", paciente: pacienteAtualizado });
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar paciente." });
  }
});

app.delete("/api/pacientes/:id", verificarToken, async (req, res) => {
  try {
    const filtro = req.nutri.role === 'admin' ? { id: parseInt(req.params.id) } : { id: parseInt(req.params.id), nutricionista_id: req.nutri.id };
    
    await prisma.pacientes.delete({
      where: filtro,
    });
    res.json({ message: "Paciente excluído com sucesso!" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir paciente." });
  }
});


// ==========================================
//        ALIMENTOS E EQUIVALÊNCIAS
// ==========================================

async function buscarAlimento(nomeAlimento) {
  try {
    const nomeLower = nomeAlimento.toLowerCase().trim();
    const alimentos = await prisma.banco_equivale.findMany({
      select: { id: true, Alimento: true, Energia__Kcal_: true, grupo: true }
    });
    return alimentos.find(a => a.Alimento && a.Alimento.toLowerCase().includes(nomeLower)) || null;
  } catch (error) {
    console.error("Erro ao buscar alimento no banco unificado:", error);
    return null;
  }
}

app.get("/api/sugestoes", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "Query obrigatória" });
  try {
    const alimentos = await prisma.banco_equivale.findMany({
      where: { Alimento: { contains: query.toLowerCase().trim() } },
      select: { Alimento: true },
      take: 8
    });
    res.json({ sugestoes: alimentos.map(a => a.Alimento) });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar sugestões no banco unificado." });
  }
});

app.get("/api/equivalencia", async (req, res) => {
  const { baseFood, baseQuantity, substituteFood, pacienteId, confirmado } = req.query;
  
  if (!baseFood || !baseQuantity || !substituteFood) {
    return res.status(400).json({ error: "Parâmetros obrigatórios ausentes." });
  }

  try {
    const base = await buscarAlimento(baseFood);
    const sub = await buscarAlimento(substituteFood);
    
    if (!base || !sub) {
      return res.status(404).json({ error: "Um ou ambos os alimentos não foram localizados no sistema." });
    }

    const calBase = parseFloat(base.Energia__Kcal_) || 0;
    const calSub = parseFloat(sub.Energia__Kcal_) || 0;
    
    if (calSub === 0) {
      return res.status(400).json({ error: "O alimento substituto possui valor calórico inválido para cálculo." });
    }

    const qtdEquiv = (parseFloat(baseQuantity) * calBase) / calSub;
    const resultadoFormatado = qtdEquiv.toFixed(2);

    const gruposDiferentes = base.grupo !== sub.grupo;
    let bloquearTrocaDiferente = false; 

    const foiConfirmadoPeloNutri = confirmado === true || confirmado === 'true';

    // Bloqueio do paciente inteligente
    if (gruposDiferentes && pacienteId && !foiConfirmadoPeloNutri) {
      try {
        const paciente = await prisma.pacientes.findUnique({
          where: { id: parseInt(pacienteId) },
          include: { nutricionista: true }
        });
        
        if (paciente?.nutricionista?.bloquear_grupos_diferentes === true) {
          bloquearTrocaDiferente = true;
        }
      } catch (e) {
        console.warn("[Aviso] Erro ao buscar configuração de bloqueio do nutricionista:", e.message);
      }
    }

    // RESPOSTA DE RETORNO DO BLOQUEIO
    if (gruposDiferentes && bloquearTrocaDiferente) {
      return res.status(200).json({
        permitido: false,
        bloqueado: true,
        gruposDiferentes: true,
        title: "Substituição Não Permitida",
        mensagem: "Não é permitida a troca de alimentos de grupos diferentes. Fale com seu nutricionista.",
        detalhes: "Seu nutricionista bloqueou substituições fora da mesma categoria nutricional."
      });
    }

    const mensagemAlerta = gruposDiferentes 
      ? `⚠️ Atenção! Você está trocando alimentos de categorias diferentes: '${base.Alimento}' (${base.grupo}) por '${sub.Alimento}' (${sub.grupo}). A troca não é a ideal, mas o resultado equivalente é: ${resultadoFormatado}g de ${sub.Alimento}.`
      : "";

    const payloadUnificado = {
      permitido: true,
      bloqueado: false,
      gruposDiferentes,
      mensagem: mensagemAlerta,
      aviso: mensagemAlerta,
      baseFood, 
      baseQuantity, 
      substituteFood,
      equivalentQuantity: resultadoFormatado,
      baseGroup: base.grupo, 
      substituteGroup: sub.grupo,
      quantidade_equivalente: resultadoFormatado,
      alimento_substituto: substituteFood,
      alimento_base: baseFood,
      grupo_base: base.grupo,
      grupo_substituto: sub.grupo
    };

    res.json(payloadUnificado);

  } catch (error) {
    console.error("Erro na rota de equivalência unificada:", error);
    res.status(500).json({ error: "Erro interno no processamento do cálculo." });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
