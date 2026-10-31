
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class FirebaseBearerScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.firebase_authentication.FirebaseTokenAuthentication"
    name = "FirebaseBearer"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "Firebase ID Token",
        }
