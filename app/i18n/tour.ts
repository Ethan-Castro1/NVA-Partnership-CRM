import { defineMessages } from "./define";

/** The guided tour of the app (one for staff, one for administrators). */
export default defineMessages(
  {
    take: "Take the tour",
    label: "Tour of Village Partners",
    step: "{n} of {total}",
    next: "Next",
    back: "Back",
    close: "Close the tour",
    done: "Done",
    start: "Show me around",
    later: "Not now",

    "welcome.title": "Welcome to Village Partners",
    "staff.welcome.body":
      "This short tour shows how to find community members who can help your students: search, connect, arrange. It takes about a minute.",
    "admin.welcome.body":
      "Village Partners has two sides: the directory staff use to find help, and your CRM for relationships, follow-ups and email. This tour takes about two minutes.",

    "staff.search.title": "Search",
    "staff.search.body":
      "Start here. Describe what you need in everyday words, like \"someone to teach basic carpentry.\" You only see people who have agreed to work with NVA staff.",
    "staff.ask.title": "Ask the Village",
    "staff.ask.body":
      "Ask a question and get an answer from NVA's records: who could help, why, and how to reach them. Only you can see your chats.",
    "staff.connect.title": "Connect",
    "staff.connect.body":
      "Each card shows what the person can help with, and after a search, why they match. Contact them directly when they're open to it, or request an introduction and the partnership team will connect you. Save anyone you want to find again.",
    "staff.arrange.title": "Arrange",
    "staff.arrange.body":
      "No name in mind? Send a short request and the partnership team will help. When the activity has happened, mark it Completed and it's added to the partner's history.",
    "staff.caps.title": "CAPs",
    "staff.caps.body": "This semester's Community Action Projects, with the partners working on each one.",
    "staff.connections.title": "My Connections",
    "staff.connections.body": "People you've worked with, asked about or saved, all in one place.",
    "staff.done.title": "You're ready",

    "admin.followUps.title": "What needs attention",
    "admin.followUps.body":
      "Your dashboard opens with follow-ups that are overdue, due today, coming up or waiting for a reply. Mark them done or reschedule them right here.",
    "admin.quick.title": "Quick actions",
    "admin.quick.body": "Add a contact, record a conversation, set a follow-up or draft an email without leaving the dashboard.",
    "admin.people.title": "People & Organizations",
    "admin.people.body":
      "Everyone in one place. Add someone with just a name and an email or phone; the rest can wait. A profile holds their history, opportunities, follow-ups and whether staff can see them.",
    "admin.opportunities.title": "Opportunities",
    "admin.opportunities.body":
      "Track each engagement or funding prospect on its own, from Not contacted to Completed. Funding has its own stages. Changing a stage never changes the person's overall status.",
    "admin.followUpsPage.title": "Follow-ups",
    "admin.followUpsPage.body":
      "Every task, sorted into Overdue, Due today, Upcoming, Awaiting response and Completed. Reminders show up here, never by email.",
    "admin.requests.title": "Staff Requests",
    "admin.requests.body":
      "What staff have asked for, including introductions. Suggest people, update the status and keep the history in one place.",
    "admin.comms.title": "Communications",
    "admin.comms.body":
      "Connect an NVA mailbox to send email from a profile and keep it in the contact's history. AI drafts use only what's on file, and nothing is sent until you click Send.",
    "admin.signups.title": "Community Sign-ups",
    "admin.signups.body":
      "People who filled in the public Join form. Approve, edit or reject each one. Matches with existing contacts are shown so you can link them instead of making a duplicate.",
    "admin.settings.title": "Settings",
    "admin.settings.body": "Staff accounts, the email connection, AI and a setup checklist.",
    "admin.ask.title": "Ask the Village",
    "admin.ask.body":
      "Ask about your partners in plain words. Staff use the same page, but only ever see what they're allowed to.",
    "admin.done.title": "You're all set",

    "done.body": "Take this tour again any time from the menu under your name, at the bottom of the sidebar.",
  },
  {
    take: "Hacer el recorrido",
    label: "Recorrido por Socios de la Aldea",
    step: "{n} de {total}",
    next: "Siguiente",
    back: "Atrás",
    close: "Cerrar el recorrido",
    done: "Listo",
    start: "Muéstrame",
    later: "Ahora no",

    "welcome.title": "Te damos la bienvenida a Socios de la Aldea",
    "staff.welcome.body":
      "Este recorrido corto muestra cómo encontrar a miembros de la comunidad que pueden ayudar a tus estudiantes: buscar, conectar, organizar. Toma más o menos un minuto.",
    "admin.welcome.body":
      "Socios de la Aldea tiene dos partes: el directorio que usa el personal para encontrar ayuda, y tu CRM para relaciones, seguimientos y correo. Este recorrido toma más o menos dos minutos.",

    "staff.search.title": "Buscar",
    "staff.search.body":
      "Empieza aquí. Describe lo que necesitas con tus propias palabras, como \"alguien que enseñe carpintería básica\". Solo verás a personas que aceptaron trabajar con el personal de NVA.",
    "staff.ask.title": "Pregúntale a la aldea",
    "staff.ask.body":
      "Haz una pregunta y recibe una respuesta de los registros de NVA: quién podría ayudar, por qué y cómo contactarle. Solo tú puedes ver tus conversaciones.",
    "staff.connect.title": "Conectar",
    "staff.connect.body":
      "Cada tarjeta muestra en qué puede ayudar la persona y, después de una búsqueda, por qué coincide. Contáctala directamente cuando lo permita, o pide una presentación y el equipo de alianzas los pondrá en contacto. Guarda a quien quieras volver a encontrar.",
    "staff.arrange.title": "Organizar",
    "staff.arrange.body":
      "¿No tienes un nombre en mente? Envía una solicitud corta y el equipo de alianzas te ayudará. Cuando la actividad haya ocurrido, márcala como Completada y se añadirá al historial de la persona.",
    "staff.caps.title": "CAPs",
    "staff.caps.body": "Los Proyectos de Acción Comunitaria de este semestre, con las personas que colaboran en cada uno.",
    "staff.connections.title": "Mis conexiones",
    "staff.connections.body": "Las personas con quienes has trabajado, sobre quienes has preguntado o que has guardado, en un solo lugar.",
    "staff.done.title": "Ya estás listo",

    "admin.followUps.title": "Lo que necesita atención",
    "admin.followUps.body":
      "Tu panel empieza con los seguimientos atrasados, para hoy, próximos o esperando respuesta. Márcalos como hechos o cámbialos de fecha aquí mismo.",
    "admin.quick.title": "Acciones rápidas",
    "admin.quick.body": "Añade un contacto, registra una conversación, programa un seguimiento o escribe un correo sin salir del panel.",
    "admin.people.title": "Personas y organizaciones",
    "admin.people.body":
      "Todos en un solo lugar. Añade a alguien con solo un nombre y un correo o teléfono; lo demás puede esperar. Un perfil guarda su historial, oportunidades, seguimientos y si el personal puede verle.",
    "admin.opportunities.title": "Oportunidades",
    "admin.opportunities.body":
      "Sigue cada colaboración o posible financiamiento por separado, desde Sin contactar hasta Completado. El financiamiento tiene sus propias etapas. Cambiar una etapa nunca cambia el estado general de la persona.",
    "admin.followUpsPage.title": "Seguimientos",
    "admin.followUpsPage.body":
      "Todas las tareas, en Atrasados, Para hoy, Próximos, Esperando respuesta y Completados. Los recordatorios aparecen aquí, nunca por correo.",
    "admin.requests.title": "Solicitudes del personal",
    "admin.requests.body":
      "Lo que ha pedido el personal, incluidas las presentaciones. Sugiere personas, actualiza el estado y mantén el historial en un solo lugar.",
    "admin.comms.title": "Comunicaciones",
    "admin.comms.body":
      "Conecta un buzón de NVA para enviar correos desde un perfil y guardarlos en el historial del contacto. Los borradores de IA usan solo lo que está registrado, y nada se envía hasta que hagas clic en Enviar.",
    "admin.signups.title": "Inscripciones de la comunidad",
    "admin.signups.body":
      "Las personas que llenaron el formulario público. Aprueba, edita o rechaza cada una. Se muestran las coincidencias con contactos existentes para que puedas vincularlas en vez de duplicarlas.",
    "admin.settings.title": "Configuración",
    "admin.settings.body": "Las cuentas del personal, la conexión de correo, la IA y una lista de configuración.",
    "admin.ask.title": "Pregúntale a la aldea",
    "admin.ask.body":
      "Pregunta sobre tus aliados con tus propias palabras. El personal usa la misma página, pero solo ve lo que se le permite.",
    "admin.done.title": "Todo listo",

    "done.body": "Puedes volver a hacer este recorrido cuando quieras desde el menú bajo tu nombre, al final de la barra lateral.",
  },
);
