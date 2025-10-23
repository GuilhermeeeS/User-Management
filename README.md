# User Management App
 <img align="center" alt="Node.js" src="https://img.shields.io/badge/Node.js-5FA04E.svg?style=for-the-badge&logo=nodedotjs&logoColor=white"/>

- Sistema de gestão de usuários.

## Features
- Replicação da gestão dos usuários.
- Verificação de conectividade de todos os relógios.
- Atualização do login de sessão.

## How to use

1. Clone o repositório para sua máquina.

2. No terminal acesse a pasta do projeto através de ```cd [Nome da Pasta]```:

3. Instalar dependências do Node.js
~~~
npm install 
~~~

## Requirements

- Node.js v20.17.0 ou maior
- Library ```express```
- Library ```express-session```
- Library ```cors```
- Library ```bcryptjs```
- Library ```node-fetch```

##

4. Configure as variáveis de ambiente:
Crie um arquivo `.env` no diretório raiz do projeto e adicione as seguintes linhas:
  ```
  PORT=3000
  API_BASE=/api
  PASSWORD_HASH=your_password_hash
  ```
##

5. Adição do arquivo `ips.json` em `/backend/data`.
```
   {
  "devices": [
    {
      "id": 1,
      "ip": "ENDEREÇO_IP",
      "login": "SENHA",
      "password": "SENHA",
      "name": "NOME_DO_RELOGIO"
```
##
7. Rodar o scprit de forma manual (index.js)
~~~
node index.js
~~~
