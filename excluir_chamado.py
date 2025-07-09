from app import create_app, db
from app.models import Ticket

app = create_app()

with app.app_context():
    while True:
        try:
            id_chamado = int(input("Digite o ID do chamado a excluir (ou 0 para sair): "))
            if id_chamado == 0:
                print("Encerrando o programa.")
                break

            chamado = Ticket.query.get(id_chamado)
            if chamado:
                print(f"Excluindo chamado: {chamado.titulo}")
                db.session.delete(chamado)
                db.session.commit()
                print("✅ Chamado excluído com sucesso.\n")
            else:
                print("❌ Chamado não encontrado.\n")
        except ValueError:
            print("⚠️ Por favor, digite um número válido.\n")
