from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app.forms import SetorForm
from app.models import Setor, db

setores_bp = Blueprint('setores', __name__)

@setores_bp.route('/setores')
@login_required
def listar_setores():
    if current_user.tipo != 'admin':
        return "Acesso negado", 403

    setores = Setor.query.all()
    return render_template('setores/listar.html', setores=setores)

@setores_bp.route('/setores/novo', methods=['GET', 'POST'])
@login_required
def novo_setor():
    if current_user.tipo != 'admin':
        return "Acesso negado", 403

    form = SetorForm()
    if form.validate_on_submit():
        setor = Setor(nome=form.nome.data, email=form.email.data)
        db.session.add(setor)
        db.session.commit()
        flash('Setor criado com sucesso!', 'success')
        return redirect(url_for('setores.listar_setores'))
    return render_template('setores/novo.html', form=form)

@setores_bp.route('/setores/<int:id>/editar', methods=['GET', 'POST'])
@login_required
def editar_setor(id):
    if current_user.tipo != 'admin':
        return "Acesso negado", 403

    setor = Setor.query.get_or_404(id)
    form = SetorForm(obj=setor)
    if form.validate_on_submit():
        setor.nome = form.nome.data
        setor.email = form.email.data
        db.session.commit()
        flash('Setor atualizado com sucesso!', 'success')
        return redirect(url_for('setores.listar_setores'))
    return render_template('setores/editar.html', form=form)
