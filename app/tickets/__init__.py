from flask import Blueprint

tickets = Blueprint('tickets', __name__)

from . import routes