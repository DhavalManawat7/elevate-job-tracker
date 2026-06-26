import os
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from dotenv import load_dotenv

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(base_dir, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL and SUPABASE_KEY not found. App will not function properly without Supabase.")

# Create a global supabase client (for admin tasks or if needed, but usually we use the user's JWT)
# Wait, for RLS to work properly, we should instantiate a client WITH the user's JWT
# But for simplicity, we can use the anon client and pass auth token in headers, 
# or just use the admin client but append .eq("user_id", user_id)
# Actually, the best practice is to pass the token to a new client instance
def get_supabase(token: str = None) -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    if token:
        # Set the auth header so RLS policies apply to this client instance
        client.postgrest.auth(token)
    return client

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    FastAPI dependency that extracts the JWT token from the Authorization header,
    verifies it against Supabase, and returns the user object.
    """
    token = credentials.credentials
    supabase = get_supabase()
    
    try:
        # Verify the token by getting the user
        response = supabase.auth.get_user(token)
        if response and response.user:
            return {"user": response.user, "token": token}
        else:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication error: {str(e)}")
