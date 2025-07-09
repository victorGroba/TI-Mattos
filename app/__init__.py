import os
import datetime
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf import CSRFProtect
from flask_migrate import Migrate
from flask_mail import Mail  # ⬅️ Importa o Flask-Mail

db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()
migrate = Migrate()
mail = Mail()  # ⬅️ Instância global do Mail

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'chave-secreta-grobatech'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///helpdesk.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # ⚙️ Configurações de e-mail (usando Gmail)
    app.config['MAIL_SERVER'] = 'smtp.gmail.com'
    app.config['MAIL_PORT'] = 587
    app.config['MAIL_USE_TLS'] = True
    app.config['MAIL_USERNAME'] = 'ti.mattos2025@gmail.com'
    app.config['MAIL_PASSWORD'] = 'jcof xipu gulp ryqv'  # 🔐 Troque pela senha de app gerada no Gmail
    app.config['MAIL_DEFAULT_SENDER'] = 'ti.mattos2025@gmail.com'

    # Inicializa extensões
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    mail.init_app(app)  # ⬅️ Inicializa o Mail

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
