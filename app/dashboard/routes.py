from flask import Blueprint, render_template
from flask_login import login_required, current_user
from app.models import Ticket, Setor, Categoria

dashboard = Blueprint('dashboard', __name__)

@dashboard.route('/')
@login_required
def index():
    if current_user.tipo == 'admin':
        chamados = Ticket.query.order_by(Ticket.id.desc()).all()
        setores = Setor.query.all()
        return render_template('admin/painel_admin.html', chamados=chamados, setores=setores)
    else:
        chamados = Ticket.query.filter_by(criador_id=current_user.id).order_by(Ticket.id.desc()).all()

        return render_template('dashboard.html', chamados=chamados)
