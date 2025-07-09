from flask_mail import Message
from app import mail

def enviar_email(destinatario, assunto, corpo):
    try:
        # Garante que destinatario pode ser lista ou string
        if isinstance(destinatario, str):
            destinatarios = [destinatario]
        else:
            destinatarios = destinatario

        msg = Message(
            subject=assunto,
            recipients=destinatarios,
            body=corpo
        )
        mail.send(msg)
        print(f"E-mail enviado para: {', '.join(destinatarios)}")
    except Exception as e:
        print(f"Erro ao enviar e-mail: {e}")
