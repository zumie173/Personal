from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Claude / Anthropic
    anthropic_api_key: str

    # Database
    database_url: str = "postgresql://localhost:5432/tfh_sales"

    # Google Sheets (Phase 1)
    google_sheets_credentials_json: str = ""
    google_sheets_spreadsheet_id: str = ""

    # Airtable (Phase 2)
    airtable_api_key: str = ""
    airtable_base_id: str = ""

    # Apify
    apify_api_token: str

    # Hunter.io
    hunter_api_key: str = ""

    # API server
    api_secret_key: str
    debug: bool = False
    log_level: str = "INFO"

    # ICP config path
    icp_weights_path: str = "config/icp_weights.yaml"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
