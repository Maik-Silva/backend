const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

function mapearCategoriaTaco(categoria) {
  if (!categoria) return 'Outros';
  const c = categoria.toLowerCase();
  if (c.includes('cereais') || c.includes('tubérculos') || c.includes('raízes')) return 'Cereais e Tubérculos';
  if (c.includes('leguminosas')) return 'Leguminosas';
  if (c.includes('verduras') || c.includes('hortaliças')) return 'Vegetais Folhosos/Legumes';
  if (c.includes('frutas')) return 'Frutas';
  if (c.includes('carnes') || c.includes('pescados') || c.includes('ovos') || c.includes('aves')) return 'Carnes e Proteínas';
  if (c.includes('leite')) return 'Laticínios';
  if (c.includes('nozes') || c.includes('sementes')) return 'Sementes';
  if (c.includes('óleos') || c.includes('gorduras')) return 'Gorduras';
  return 'Outros';
}

async function processarSeedTaco() {
  // Certifique-se de que o arquivo Taco-4a-Edicao.xlsx está na raiz do projeto junto com este script
  const filePath = path.resolve(__dirname, './Taco-4a-Edicao.xlsx'); 
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Erro: O arquivo ${filePath} não foi encontrado na raiz do projeto!`);
    return;
  }

  console.log('⏳ Carregando e processando o arquivo Excel da TACO (isso pode levar alguns segundos)...');
  const workbook = XLSX.readFile(filePath);
  
  // Seleciona a primeira aba ou tenta buscar a aba Centesimal pelo nome aproximado
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('centesi') || n.toLowerCase().includes('taco')) || workbook.SheetNames[0];
  console.log(`📊 Lendo a aba: "${sheetName}"`);
  const sheet = workbook.Sheets[sheetName];
  
  // Converte a aba em uma matriz de linhas e colunas
  const dadosMatriz = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`🚀 Analisando ${dadosMatriz.length} linhas de dados...`);

  let categoriaAtual = "Outros";
  let criados = 0;
  let ignoradosDuplicados = 0;

  for (let i = 0; i < dadosMatriz.length; i++) {
    const colunas = dadosMatriz[i];
    if (!colunas || colunas.length === 0) continue;

    // 1. Identifica se a linha representa uma nova categoria (Ex: "Cereais e derivados" na primeira célula e o resto vazio)
    const primeiraCelula = colunas[0]?.toString().trim();
    if (primeiraCelula && isNaN(parseInt(primeiraCelula)) && colunas.slice(1).every(c => c === undefined || c === null || c === '')) {
      categoriaAtual = primeiraCelula;
      continue;
    }

    const idAlimento = parseInt(primeiraCelula);
    if (isNaN(idAlimento)) continue; // Pula cabeçalhos textuais das colunas

    // Na TACO padrão, coluna 1 é a Descrição e coluna 3 costuma ser a Energia (kcal)
    let nomeAlimento = colunas[1]?.toString().trim();
    let kcalRaw = colunas[3]?.toString().trim();

    if (!nomeAlimento || !kcalRaw || kcalRaw === 'NA' || kcalRaw === '-') continue;

    const kcalVal = Math.round(parseFloat(kcalRaw.replace(',', '.')));
    if (isNaN(kcalVal)) continue;

    const grupoGeral = mapearCategoriaTaco(categoriaAtual);

    try {
      // Evita duplicidade cruzada com a TBCA
      const registroExistente = await prisma.banco_equivale.findFirst({
        where: { Alimento: nomeAlimento }
      });

      if (registroExistente) {
        ignoradosDuplicados++;
        continue;
      }

      // Salva no Banco Geral
      await prisma.banco_equivale.create({
        data: {
          Alimento: nomeAlimento,
          Quantidade__g_: 100,
          Energia__Kcal_: kcalVal,
          grupo: grupoGeral
        }
      });

      // Salva nas tabelas dos grupos correspondentes do seu Schema
      const dadosGrupo = { Alimento: nomeAlimento, Quantidade__g_: 100, Energia__Kcal_: kcalVal };

      switch (grupoGeral) {
        case 'Carnes e Proteínas':
          await prisma.proteina.create({ data: dadosGrupo });
          break;
        case 'Frutas':
          await prisma.frutas.create({ data: dadosGrupo });
          break;
        case 'Leguminosas':
          await prisma.leguminosas.create({ data: dadosGrupo });
          break;
        case 'Sementes':
          await prisma.sementes.create({ data: dadosGrupo });
          break;
        case 'Gorduras':
          await prisma.gorduras.create({ data: dadosGrupo });
          break;
        case 'Laticínios':
          await prisma.leite_e_derivados.create({ data: dadosGrupo });
          break;
        case 'Cereais e Tubérculos':
          await prisma.cereais_e_tuberculos.create({ data: dadosGrupo });
          break;
        case 'Vegetais Folhosos/Legumes':
          await prisma.verduras__hortali_as_e_derivados.create({ data: dadosGrupo });
          break;
      }

      criados++;

      if (criados % 50 === 0) {
        console.log(`Progresso TACO: ${criados} novos alimentos adicionados...`);
      }

    } catch (err) {
      continue; // Ignora erros isolados de banco e continua o loop
    }
  }

  console.log(`\n🎉 Integração da TACO (.xlsx) concluída!`);
  console.log(`🔹 Novos registros exclusivos adicionados: ${criados}`);
  console.log(`🔹 Alimentos repetidos ignorados (já vindos da TBCA): ${ignoradosDuplicados}`);
}

processarSeedTaco()
  .catch((e) => console.error('Erro crítico no seed da TACO:', e))
  .finally(async () => await prisma.$disconnect());
