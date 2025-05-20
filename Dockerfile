# Usando a imagem oficial do Node.js
FROM node:18

# Definindo o diretório de trabalho dentro do container
WORKDIR /app

# Copiando os arquivos de dependência para o container
COPY package*.json ./

# Instalando as dependências do projeto
RUN npm install

# Copiando o restante dos arquivos do projeto
COPY . .

# Rodando o comando para gerar o Prisma Client
RUN npx prisma generate

# Expondo a porta em que a API será executada (ajuste conforme necessário)
EXPOSE 5000

# Comando para rodar o servidor
CMD ["npm", "run", "start"]
