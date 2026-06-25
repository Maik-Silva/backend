const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function obtenerGrupoGeral(classeTBCA) {
  switch (classeTBCA) {
    case 'Cereais e derivados':
    case 'Tubérculos, raízes e derivados':
      return 'Cereais e Tubérculos';
    case 'Leguminosas e derivados':
      return 'Leguminosas';
    case 'Verduras, hortaliças e derivados':
      return 'Vegetais Folhosos/Legumes';
    case 'Frutas e derivados':
      return 'Frutas';
    case 'Carnes e derivados':
    case 'Pescados e frutos do mar':
    case 'Ovos e derivados':
      return 'Carnes e Proteínas';
    case 'Leites e derivados':
      return 'Laticínios';
    case 'Nozes e sementes':
      return 'Sementes';
    case 'Óleos e gorduras':
      return 'Gorduras';
    default:
      return 'Outros';
  }
}

async function processarSeed() {
  const filePath = path.resolve(__dirname, './alimentos.txt'); 
  
  console.log('⏳ Carregando o arquivo de dados...');
  const conteudoTexto = fs.readFileSync(filePath, 'utf-8');
  
  // Limpeza de segurança: Se o arquivo veio envelopado como array, remove os colchetes externos
  // e separa cada objeto limpando possíveis vírgulas sobressalentes.
  let blocosTexto = conteudoTexto.trim();
  if (blocosTexto.startsWith('[')) blocosTexto = blocosTexto.substring(1);
  if (blocosTexto.endsWith(']')) blocosTexto = blocosTexto.substring(0, blocosTexto.length - 1);

  // Divide pelas quebras de objetos JSON: "}," ou "\n"
  const linhasCruas = blocosTexto.split(/\},\s*\{/);

  console.log(`🚀 Iniciando processamento inteligente...`);
  let criados = 0;
  let atualizados = 0;

  for (let i = 0; i < linhasCruas.length; i++) {
    try {
      let stringObjeto = linhasCruas[i].trim();
      if (!stringObjeto) continue;

      // Reconstroi o objeto JSON de forma válida caso tenha sido quebrado no split
      if (!stringObjeto.startsWith('{')) stringObjeto = '{' + stringObjeto;
      if (!stringObjeto.endsWith('}')) stringObjeto = stringObjeto + '}';

      const alimentoTBCA = JSON.parse(stringObjeto);

      const infoKcal = alimentoTBCA.nutrientes?.find(
        (n) => n.Componente === 'Energia' && n.Unidades === 'kcal'
      );
      
      const kcalVal = Math.round(
        parseFloat(infoKcal?.['Valor por 100g']?.replace(',', '.') || '0')
      );

      if (!alimentoTBCA.descricao || isNaN(kcalVal) || kcalVal <= 0) continue;

      const nomeAlimento = alimentoTBCA.descricao;
      const grupoGeral = obtenerGrupoGeral(alimentoTBCA.classe);

      // --- TRAVA DE DUPLICIDADE: Tabela Central 'banco_equivale' ---
      const registroExistenteGeral = await prisma.banco_equivale.findFirst({
        where: { Alimento: nomeAlimento }
      });

      if (registroExistenteGeral) {
        await prisma.banco_equivale.update({
          where: { id: registroExistenteGeral.id },
          data: { Energia__Kcal_: kcalVal, grupo: grupoGeral }
        });
        atualizados++;
      } else {
        await prisma.banco_equivale.create({
          data: { Alimento: nomeAlimento, Quantidade__g_: 100, Energia__Kcal_: kcalVal, grupo: grupoGeral }
        });
        criados++;
      }

      // --- TRAVA DE DUPLICIDADE: Tabelas específicas ---
      const dadosTabelaEspecifica = { Alimento: nomeAlimento, Quantidade__g_: 100, Energia__Kcal_: kcalVal };

      switch (alimentoTBCA.classe) {
        case 'Carnes e derivados':
        case 'Pescados e frutos do mar':
        case 'Ovos e derivados':
          const exProteina = await prisma.proteina.findFirst({ where: { Alimento: nomeAlimento } });
          if (exProteina) {
            await prisma.proteina.update({ where: { id: exProteina.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.proteina.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Frutas e derivados':
          const exFrutas = await prisma.frutas.findFirst({ where: { Alimento: nomeAlimento } });
          if (exFrutas) {
            await prisma.frutas.update({ where: { id: exFrutas.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.frutas.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Leguminosas e derivados':
          const exLeguminosas = await prisma.leguminosas.findFirst({ where: { Alimento: nomeAlimento } });
          if (exLeguminosas) {
            await prisma.leguminosas.update({ where: { id: exLeguminosas.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.leguminosas.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Nozes e sementes':
          const exSementes = await prisma.sementes.findFirst({ where: { Alimento: nomeAlimento } });
          if (exSementes) {
            await prisma.sementes.update({ where: { id: exSementes.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.sementes.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Óleos e gorduras':
          const exGorduras = await prisma.gorduras.findFirst({ where: { Alimento: nomeAlimento } });
          if (exGorduras) {
            await prisma.gorduras.update({ where: { id: exGorduras.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.gorduras.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Leites e derivados':
          const exLeite = await prisma.leite_e_derivados.findFirst({ where: { Alimento: nomeAlimento } });
          if (exLeite) {
            await prisma.leite_e_derivados.update({ where: { id: exLeite.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.leite_e_derivados.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Cereais e derivados':
        case 'Tubérculos, raízes e derivados':
          const exCereais = await prisma.cereais_e_tuberculos.findFirst({ where: { Alimento: nomeAlimento } });
          if (exCereais) {
            await prisma.cereais_e_tuberculos.update({ where: { id: exCereais.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.cereais_e_tuberculos.create({ data: dadosTabelaEspecifica });
          }
          break;

        case 'Verduras, hortaliças e derivados':
          const exVerduras = await prisma.verduras__hortali_as_e_derivados.findFirst({ where: { Alimento: nomeAlimento } });
          if (exVerduras) {
            await prisma.verduras__hortali_as_e_derivados.update({ where: { id: exVerduras.id }, data: { Energia__Kcal_: kcalVal } });
          } else {
            await prisma.verduras__hortali_as_e_derivados.create({ data: dadosTabelaEspecifica });
          }
          break;
      }

      if ((criados + atualizados) % 200 === 0) {
        console.log(`Log: ${criados} criados, ${atualizados} atualizados (espaço economizado)...`);
      }

    } catch (err) {
      // Ignora pedaços malformados ou linhas vazias das pontas
      continue;
    }
  }

  console.log(`\n🎉 Processo concluído com sucesso total!`);
  console.log(`🔹 Novos registros criados: ${criados}`);
  console.log(`🔹 Alimentos repetidos atualizados: ${atualizados}`);
}

processarSeed()
  .catch((e) => console.error('Erro crítico no seed:', e))
  .finally(async () => await prisma.$disconnect());
