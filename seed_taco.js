const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Mapeamento das categorias nativas da TACO para os grupos do seu sistema
function mapearCategoriaTaco(categoria) {
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
  // Ajuste o nome do arquivo para bater exatamente com o arquivo que está na pasta prisma/ ou na raiz
  const filePath = path.resolve(__dirname, './Taco-4a-Edicao.xlsx - CMVCol taco3.csv'); 
  
  console.log('⏳ Carregando o arquivo CMVCol da TACO...');
  const conteudoTexto = fs.readFileSync(filePath, 'utf-8');
  
  const linhas = conteudoTexto.split(/\r?\n/);
  console.log(`🚀 Analisando ${linhas.length} linhas...`);

  let categoriaAtual = "Outros";
  let criados = 0;
  let ignoradosDuplicados = 0;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (!linha) continue;

    // Divide a linha considerando possíveis aspas em nomes compostos
    const colunas = linha.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

    // 1. Identifica se a linha é um cabeçalho de categoria (ex: "Cereais e derivados,,,,,,,,...")
    if (colunas[0] && isNaN(parseInt(colunas[0].trim())) && colunas.slice(1).every(c => c.trim() === '')) {
      categoriaAtual = colunas[0].replace(/"/g, '').trim();
      continue;
    }

    const idAlimento = parseInt(colunas[0]?.trim());
    // Pula linhas de cabeçalho de colunas ou linhas inválidas
    if (isNaN(idAlimento)) continue;

    let nomeAlimento = colunas[1]?.replace(/"/g, '').trim();
    let kcalRaw = colunas[3]?.trim();

    if (!nomeAlimento || !kcalRaw || kcalRaw === 'NA' || kcalRaw === '-') continue;

    // Converte kcal para número inteiro (substituindo vírgula por ponto se houver)
    const kcalVal = Math.round(parseFloat(kcalRaw.replace(',', '.')));
    if (isNaN(kcalVal)) continue;

    const grupoGeral = mapearCategoriaTaco(categoriaAtual);

    try {
      // --- TRAVA DE DUPLICIDADE COESA ---
      const registroExistente = await prisma.banco_equivale.findFirst({
        where: { Alimento: nomeAlimento }
      });

      if (registroExistente) {
        ignoradosDuplicados++;
        continue; // Já veio da TBCA ou foi processado, pula para manter integridade
      }

      // Adiciona na tabela central do Banco de Equivalentes
      await prisma.banco_equivale.create({
        data: {
          Alimento: nomeAlimento,
          Quantidade__g_: 100,
          Energia__Kcal_: kcalVal,
          grupo: grupoGeral
        }
      });

      // Adiciona na respectiva tabela de grupo específico
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
      // Pula qualquer erro de linha individual de forma segura
      continue;
    }
  }

  console.log(`\n🎉 Integração da TACO concluída!`);
  console.log(`🔹 Novos registros exclusivos da TACO adicionados: ${criados}`);
  console.log(`🔹 Alimentos repetidos ignorados (já existentes da TBCA): ${ignoradosDuplicados}`);
}

processarSeedTaco()
  .catch((e) => console.error('Erro crítico no seed da TACO:', e))
  .finally(async () => await prisma.$disconnect());
