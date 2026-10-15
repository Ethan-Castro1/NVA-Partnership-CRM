import { defineMessages } from "./define";

/** My account: name, language and password for the signed-in staff member. */
export default defineMessages(
  {
    title: "My account",
    description: "Your name, the language you see the app in, and your password.",
    signedInAs: "Signed in as {email}",

    "profile.title": "Profile",
    "profile.language": "App language",
    "profile.languageHint": "Used every time you sign in, on any device.",
    "profile.save": "Save profile",
    "profile.saved": "Your profile is saved.",

    "password.title": "Change password",
    "password.description": "Changing it signs you out on every other device.",
    "password.current": "Current password",
    "password.new": "New password",
    "password.confirm": "Confirm new password",
    "password.hint": "At least {min} characters.",
    "password.submit": "Change password",
    "password.saved": "Password changed. Your other devices were signed out.",

    "error.nameRequired": "Please enter your name.",
    "error.currentWrong": "Your current password isn't right.",
    "error.mismatch": "The new passwords don't match.",
    "error.tooShort": "Use at least {min} characters.",
    "error.invalid": "That request didn't look right. Please try again.",
  },
  {
    title: "Mi cuenta",
    description: "Tu nombre, el idioma en que ves la aplicación y tu contraseña.",
    signedInAs: "Sesión iniciada como {email}",

    "profile.title": "Perfil",
    "profile.language": "Idioma de la aplicación",
    "profile.languageHint": "Se usa cada vez que inicias sesión, en cualquier dispositivo.",
    "profile.save": "Guardar perfil",
    "profile.saved": "Tu perfil está guardado.",

    "password.title": "Cambiar contraseña",
    "password.description": "Al cambiarla se cierra tu sesión en todos los demás dispositivos.",
    "password.current": "Contraseña actual",
    "password.new": "Contraseña nueva",
    "password.confirm": "Confirma la contraseña nueva",
    "password.hint": "Al menos {min} caracteres.",
    "password.submit": "Cambiar contraseña",
    "password.saved": "Contraseña cambiada. Se cerró tu sesión en los demás dispositivos.",

    "error.nameRequired": "Escribe tu nombre.",
    "error.currentWrong": "Tu contraseña actual no es correcta.",
    "error.mismatch": "Las contraseñas nuevas no coinciden.",
    "error.tooShort": "Usa al menos {min} caracteres.",
    "error.invalid": "Esa solicitud no se veía bien. Inténtalo de nuevo.",
  },
);
