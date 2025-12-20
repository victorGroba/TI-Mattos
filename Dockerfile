# Usa uma imagem Python leve
FROM python:3.11-slim

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Instala dependências do sistema necessárias (opcional, mas bom prevenir)
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Copia e instala as dependências do Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código do projeto para dentro do container
COPY . .

# Define variáveis de ambiente para produção
ENV FLASK_APP=run.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Expõe a porta 5000 (ou a que preferir)
EXPOSE 5000

# Comando para iniciar o servidor Gunicorn (4 workers é um bom padrão)
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "run:app"]