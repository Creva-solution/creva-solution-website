from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
import smtplib
from email.mime.text import MIMEText

app = FastAPI()

# Allow frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # replace "*" with your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/send-mail/")
async def send_mail(
    first_name: str = Form(...),
    last_name: str = Form(...),
    email: str = Form(...),
    subject: str = Form(...),
    message: str = Form(...)
):
    # Compose email
    body = f"""
    {first_name} {last_name} wants to collaborate!

    Message: {message}
    Contact Email: {email}
    """
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = email
    msg["To"] = "crevasolution@gmail.com"  # <-- replace with your email

    # Send email via Gmail
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login("crevasolution@gmail.com", "ylzm dnqw odjq wrdl")  # Use App Password
        server.send_message(msg)

    return {"status": "Mail sent successfully!"}
