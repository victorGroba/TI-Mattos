# criar_admin.py
from app import create_app, db
from app.models import User, Setor

app = create_app()
app.app_context().push()

# Crie um setor padrão, se não houver
setor = Setor.query.first()
if not setor:
    setor = Setor(nome='Administrativo')
    db.session.add(setor)
    db.session.commit()

# Crie o usuário admin
admin = User(
    nome='Administrador',
    email='admin@admin.com',
    senha='admin123',
    tipo='admin',
    setor_id=setor.id
)

db.session.add(admin)
db.session.commit()
print("✅ Usuário admin criado com sucesso.")
