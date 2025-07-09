from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.models import User, Setor, db
from app.forms import UserForm

usuarios_bp = Blueprint('usuarios', __name__)

@usuarios_bp.route('/usuarios')
@login_required
def listar_usuarios():
    if current_user.tipo != 'admin':
        return "Acesso negado", 403

    usuarios = User.query.all()
    return render_template('usuarios/listar.html', usuarios=usuarios)

@usuarios_bp.route('/usuarios/novo', methods=['GET', 'POST'])
@login_required
def novo_usuario():
    if current_user.tipo != 'admin':
        return "Acesso negado", 403

    form = UserForm()
    form.setor_id.choices = [(s.id, s.nome) for s in Setor.query.all()]

    if form.validate_on_submit():
        novo = User(
            nome=form.nome.data,
            email=form.email.data,
            tipo=form.tipo.data,
            setor_id=form.setor_id.data if form.setor_id.data else None
        )
        novo.senha = form.senha.data
        db.session.add(novo)
        db.session.commit()
        flash('Usuário criado com sucesso.', 'success')
        return redirect(url_for('usuarios.listar_usuarios'))
    
    return render_template('usuarios/novo.html', form=form)

@usuarios_bp.route('/usuarios/<int:id>/editar', methods=['GET', 'POST'])
@login_required
def editar_usuario(id):
    if current_user.tipo != 'admin':
        return "Acesso negado", 403

    usuario = User.query.get_or_404(id)
    form = UserForm(obj=usuario)
    form.setor_id.choices = [(s.id, s.nome) for s in Setor.query.all()]

    if form.validate_on_submit():
        usuario.nome = form.nome.data
        usuario.email = form.email.data
        usuario.tipo = form.tipo.data
        usuario.setor_id = form.setor_id.data if form.setor_id.data else None
        if form.senha.data:
            usuario.senha = form.senha.data
        db.session.commit()
        flash('Usuário atualizado com sucesso.', 'success')
        return redirect(url_for('usuarios.listar_usuarios'))
    
    return render_template('usuarios/editar.html', form=form)
