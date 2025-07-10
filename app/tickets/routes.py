from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_required, current_user
from app import db
from app.forms import NovoChamadoForm, SetorForm
from app.models import Ticket, Categoria, Setor, Resposta

tickets_bp = Blueprint('tickets', __name__)

# ===================== LISTAGEM DE CHAMADOS =====================
@tickets_bp.route('/chamados')
@login_required
def listar_chamados():
    if current_user.tipo != 'admin':
        return "Acesso não autorizado", 403

    setor_id = request.args.get('setor_id', type=int)
    setores = Setor.query.all()

    if setor_id:
        chamados = Ticket.query.filter_by(setor_id=setor_id).order_by(Ticket.data_criacao.desc()).all()
    else:
        chamados = Ticket.query.order_by(Ticket.data_criacao.desc()).all()

    return render_template('listar_chamados.html', chamados=chamados, setores=setores, setor_id=setor_id)

# ===================== VISUALIZAR/RESPONDER CHAMADO =====================
@tickets_bp.route('/chamado/<int:chamado_id>', methods=['GET', 'POST'])
@login_required
def visualizar_chamado(chamado_id):
    from app.utils.email_utils import enviar_email
    from datetime import datetime

    ticket = Ticket.query.get_or_404(chamado_id)

    # Permissão: Admin ou criador do chamado
    if current_user.tipo != 'admin' and ticket.criador_id != current_user.id:
        return "Acesso não autorizado", 403

    if request.method == 'POST':
        conteudo = request.form.get('conteudo')
        novo_status = request.form.get('status')

        if conteudo:
            resposta = Resposta(
                conteudo=conteudo,
                ticket_id=ticket.id,
                respondente_id=current_user.id
            )

            # Atualiza status conforme tipo de usuário
            if current_user.tipo == 'admin' and novo_status:
                ticket.status = novo_status
            else:
                ticket.status = 'Em andamento'

            db.session.add(resposta)
            db.session.commit()

            # ✅ Lista de destinatários: criador + responsável da TI
            destinatarios = ['ti.mattos2025@gmail.com']
            if ticket.criador.email and ticket.criador.email != 'ti.mattos2025@gmail.com':
                destinatarios.append(ticket.criador.email)

            # 💬 E-mail de nova resposta
            enviar_email(
                destinatario=destinatarios,
                assunto=f"[HelpDesk] Nova resposta no chamado #{ticket.id}",
                corpo=f"""
Prezado(a),

Uma nova interação foi registrada no chamado abaixo:

🆔 Número do Chamado: #{ticket.id}
📌 Assunto: {ticket.titulo}
📅 Data/Hora da Resposta: {resposta.data_resposta.strftime('%d/%m/%Y %H:%M')}
👤 Respondido por: {current_user.nome}

Mensagem:
"{resposta.conteudo}"

Para visualizar os detalhes e acompanhar o andamento do chamado, acesse:
🔗 http://192.168.1.152:5000/chamado/{ticket.id}

Atenciosamente,  
Equipe de Suporte Técnico  
HelpDesk - Lab Mattos
"""
            )

            # ✅ E-mail de conclusão, se aplicável
            if ticket.status == "Concluído":
                enviar_email(
                    destinatario=destinatarios,
                    assunto=f"[HelpDesk] Chamado #{ticket.id} concluído",
                    corpo=f"""
Prezado(a),

O chamado abaixo foi finalizado com status **Concluído**:

🆔 Número do Chamado: #{ticket.id}
📌 Assunto: {ticket.titulo}
📅 Encerrado em: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}
👤 Finalizado por: {current_user.nome}

Você pode consultar o histórico completo acessando:
🔗 http://192.168.1.152:5000/chamado/{ticket.id}

Caso precise reabrir o chamado ou tenha outras dúvidas, entre em contato com nossa equipe.

Atenciosamente,  
Equipe de Suporte Técnico  
HelpDesk - Lab Mattos
"""
                )

            flash('Resposta enviada com sucesso.', 'success')
            return redirect(url_for('tickets.visualizar_chamado', chamado_id=chamado_id))
        else:
            flash('A resposta não pode estar vazia.', 'danger')

    return render_template('visualizar_chamado.html', ticket=ticket)

# ===================== NOVO CHAMADO =====================
@tickets_bp.route('/chamado/novo', methods=['GET', 'POST'])
@login_required
def novo_chamado():
    from app.utils.email_utils import enviar_email  # importa dentro da função

    form = NovoChamadoForm()
    form.categoria.choices = [(c.id, c.nome) for c in Categoria.query.all()]
    form.setor.choices = [(s.id, s.nome) for s in Setor.query.all()]

    if form.validate_on_submit():
        chamado = Ticket(
            titulo=form.titulo.data,
            descricao=form.descricao.data,
            prioridade=form.prioridade.data,
            categoria_id=form.categoria.data,
            setor_id=form.setor.data,
            criador_id=current_user.id
        )
        db.session.add(chamado)
        db.session.commit()

        # 🔔 Envia e-mail para o setor responsável
        enviar_email(
            destinatario=chamado.setor.email,
            assunto=f"[HelpDesk] Novo chamado criado: {chamado.titulo}",
            corpo=f"""
Um novo chamado foi registrado no sistema:

🆔 ID: {chamado.id}
📌 Título: {chamado.titulo}
📂 Setor: {chamado.setor.nome}
🚨 Prioridade: {chamado.prioridade}
📅 Data: {chamado.data_criacao.strftime('%d/%m/%Y %H:%M')}

📄 Descrição:
{chamado.descricao}
"""
        )

        flash('Chamado criado com sucesso!', 'success')

        if current_user.tipo == 'admin':
            return redirect(url_for('tickets.listar_chamados'))
        else:
            return redirect(url_for('tickets.meus_chamados'))

    return render_template('novo_chamado.html', form=form)


# ===================== GERENCIAMENTO DE SETORES =====================
@tickets_bp.route('/setores')
@login_required
def listar_setores():
    setores = Setor.query.all()
    return render_template('setores/listar.html', setores=setores)

@tickets_bp.route('/setores/novo', methods=['GET', 'POST'])
@login_required
def novo_setor():
    form = SetorForm()
    if form.validate_on_submit():
        setor = Setor(nome=form.nome.data, email=form.email.data)
        db.session.add(setor)
        db.session.commit()
        flash('Setor criado com sucesso!', 'success')
        return redirect(url_for('tickets.listar_setores'))
    return render_template('setores/novo.html', form=form)

@tickets_bp.route('/setores/<int:id>/editar', methods=['GET', 'POST'])
@login_required
def editar_setor(id):
    setor = Setor.query.get_or_404(id)
    form = SetorForm(obj=setor)
    if form.validate_on_submit():
        setor.nome = form.nome.data
        setor.email = form.email.data
        db.session.commit()
        flash('Setor atualizado com sucesso!', 'success')
        return redirect(url_for('tickets.listar_setores'))
    return render_template('setores/editar.html', form=form)

# ===================== MEUS CHAMADOS (PARA USUÁRIO) =====================
@tickets_bp.route('/meus_chamados')
@login_required
def meus_chamados():
    chamados = Ticket.query.filter_by(criador_id=current_user.id).order_by(Ticket.data_criacao.desc()).all()
    return render_template('meus_chamados.html', chamados=chamados)


@tickets_bp.route('/teste-email')  
def teste_email():
    from app.utils.email_utils import enviar_email

    enviar_email(
        destinatario='seu.email@gmail.com',  # Troque por seu e-mail pessoal
        assunto='[HelpDesk] Teste de envio',
        corpo='Este é um teste de e-mail enviado pelo sistema HelpDesk.'
    )
    return 'E-mail de teste enviado!'

