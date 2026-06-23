from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent


class Settings(BaseSettings):
    # Claude / Anthropic
    anthropic_api_key: str

    # Apify
    apify_api_token: str

    # Google Sheets
    google_sheets_credentials_json: str   # path to service account JSON file
    google_sheets_spreadsheet_id: str

    # ICP weights config
    icp_weights_path: str = str(BASE_DIR / "config" / "icp_weights.yaml")

    # Scraping defaults
    default_max_results: int = 200

    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"


settings = Settings()
