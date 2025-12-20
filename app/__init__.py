import os
import datetime
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf import CSRFProtect
from flask_migrate import Migrate
from flask_mail import Mail

db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
mail = Mail()

def create_app():
    app = Flask(__name__)
    
    # SEGURANÇA: Busca a chave secreta do ambiente ou usa uma padrão apenas para dev
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'chave-padrao-insegura-dev')
    
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///helpdesk.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # ⚙️ Configurações de e-mail (usando o SMTP do domínio labmattos.com.br)
    app.config['MAIL_SERVER'] = 'email-ssl.com.br'
    app.config['MAIL_PORT'] = 465
    app.config['MAIL_USE_SSL'] = True
    
    # SEGURANÇA: As credenciais agora vêm do arquivo .env (variáveis de ambiente)
    app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
    app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
    
    # Se não houver remetente definido, usa o usuário do e-mail
    app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_USERNAME')

    # Inicializa extensões
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    mail.init_app(app)

    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'warning'

    # Registra os blueprints
    from app.auth.routes import auth as auth_bp
    from app.dashboard.routes import dashboard as dashboard_bp
    from app.tickets.routes import tickets_bp
    from app.usuarios.routes import usuarios_bp
    from app.setores.routes import setores_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(tickets_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(setores_bp)

    # Carrega o usuário
    from app.models import User
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Variável global para mostrar o ano atual no rodapé
    @app.context_processor
    def inject_now():
        return {'now': datetime.datetime.now}

    return app