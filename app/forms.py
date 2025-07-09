from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField, TextAreaField, SelectField
from wtforms.validators import DataRequired, Email, Length, Optional

# =====================
# FORMULÁRIO DE LOGIN
# =====================
class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    senha = PasswordField('Senha', validators=[DataRequired()])
    submit = SubmitField('Entrar')

# =====================
# FORMULÁRIO DE NOVO TICKET BÁSICO
# =====================
class TicketForm(FlaskForm):
    titulo = StringField('Título', validators=[DataRequired(), Length(max=200)])
    descricao = TextAreaField('Descrição', validators=[DataRequired()])
    prioridade = SelectField('Prioridade', choices=[
        ('Baixa', 'Baixa'), ('Média', 'Média'), ('Alta', 'Alta')
    ], validators=[DataRequired()])
    categoria = SelectField('Categoria', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Abrir Chamado')

# =====================
# FORMULÁRIO DE NOVO CHAMADO (COM SETOR)
# =====================
class NovoChamadoForm(FlaskForm):
    titulo = StringField('Título', validators=[DataRequired()])
    descricao = TextAreaField('Descrição', validators=[DataRequired()])
    prioridade = SelectField('Prioridade', choices=[
        ('Baixa', 'Baixa'), ('Média', 'Média'), ('Alta', 'Alta')
    ], validators=[DataRequired()])
    categoria = SelectField('Categoria', coerce=int, validators=[DataRequired()])
    setor = SelectField('Setor', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Abrir Chamado')

# =====================
# FORMULÁRIO DE CADASTRO DE SETOR
# =====================
class SetorForm(FlaskForm):
    nome = StringField('Nome do Setor', validators=[DataRequired()])
    email = StringField('E-mail do Setor', validators=[Optional(), Email()])
    submit = SubmitField('Salvar')

# =====================
# FORMULÁRIO DE CADASTRO DE USUÁRIO
# =====================
class UserForm(FlaskForm):
    nome = StringField('Nome', validators=[DataRequired()])
    email = StringField('E-mail', validators=[DataRequired(), Email()])
    senha = PasswordField('Senha (deixe em branco para manter)', validators=[Optional()])
    tipo = SelectField('Tipo', choices=[('admin', 'Administrador'), ('usuario', 'Usuário')], validators=[DataRequired()])
    setor_id = SelectField('Setor', coerce=int, validators=[Optional()])
    submit = SubmitField('Salvar')
