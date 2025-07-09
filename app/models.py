from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

from . import db

# ===================== USUÁRIO =====================
class User(db.Model, UserMixin):
    __tablename__ = 'user'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    senha_hash = db.Column(db.String(128), nullable=False)
    tipo = db.Column(db.String(20), nullable=False)  # 'admin' ou 'usuario'
    setor_id = db.Column(db.Integer, db.ForeignKey('setor.id'))

    setor = db.relationship('Setor', back_populates='usuarios')
    chamados_criados = db.relationship('Ticket', back_populates='criador', cascade='all, delete')
    respostas_dadas = db.relationship('Resposta', back_populates='respondente', cascade='all, delete')

    @property
    def senha(self):
        raise AttributeError('Senha não pode ser lida diretamente.')

    @senha.setter
    def senha(self, senha):
        self.senha_hash = generate_password_hash(senha)

    def verificar_senha(self, senha):
        return check_password_hash(self.senha_hash, senha)


# ===================== SETOR =====================
class Setor(db.Model):
    __tablename__ = 'setor'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(120), nullable=True)

    tickets = db.relationship('Ticket', back_populates='setor', cascade='all, delete')
    usuarios = db.relationship('User', back_populates='setor', cascade='all, delete')


# ===================== CATEGORIA =====================
class Categoria(db.Model):
    __tablename__ = 'categoria'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(50), nullable=False)

    tickets = db.relationship('Ticket', back_populates='categoria', cascade='all, delete')


# ===================== TICKET =====================
class Ticket(db.Model):
    __tablename__ = 'ticket'

    id = db.Column(db.Integer, primary_key=True)
    titulo = db.Column(db.String(200), nullable=False)
    descricao = db.Column(db.Text, nullable=False)
    prioridade = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(50), nullable=False, default='Aberto')
    data_criacao = db.Column(db.DateTime, default=datetime.utcnow)

    categoria_id = db.Column(db.Integer, db.ForeignKey('categoria.id'), nullable=False)
    setor_id = db.Column(db.Integer, db.ForeignKey('setor.id'), nullable=False)
    criador_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    categoria = db.relationship('Categoria', back_populates='tickets')
    setor = db.relationship('Setor', back_populates='tickets')
    criador = db.relationship('User', back_populates='chamados_criados')
    respostas = db.relationship('Resposta', back_populates='ticket', cascade='all, delete')


# ===================== RESPOSTA =====================
class Resposta(db.Model):
    __tablename__ = 'resposta'

    id = db.Column(db.Integer, primary_key=True)
    conteudo = db.Column(db.Text, nullable=False)
    data_resposta = db.Column(db.DateTime, default=datetime.utcnow)

    ticket_id = db.Column(db.Integer, db.ForeignKey('ticket.id'), nullable=False)
    respondente_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

    ticket = db.relationship('Ticket', back_populates='respostas')
    respondente = db.relationship('User', back_populates='respostas_dadas')
