# Argos
IP OB/Fly pack monitoring and logging

Argos, once installed, will auto run when you start the computer.
When minimised it will hide from the task bar in the background, you can get to it via the "system tray" in the bottom right.
Argos will also run a webGUI you can access at the configured port on the PC it is running on, by default this is 80. This means you can normally go to http://COMPUTERIP to get to Argos.

# Installation

## SQL
To install Argos, you first need to insall Mariadb (Or MySQL, they are interchangable)

Download here: https://mariadb.org/download/?t=mariadb&p=mariadb&r=11.3.1&os=windows&cpu=x86_64&pkg=msi&m=xtom_ams
Follow this guide: https://mariadb.com/kb/en/installing-mariadb-msi-packages-on-windows/

As part of that you will create a user and give it a password, you will need to know these to continue!

## First install
Once downloaded, run Argos for the frist time, it should ask you a series of questions on first install about what the config options are, of not sure, ask me!
If this doesn't happen or you change your mind, you can click on the "Show Logs" button in the bottom right, then the "Edit Config" button to go through the setup again. Most changes will apply instantly, but I would reboot just in case!

# Updating

If you are upgrading from Argos 3.9 or older the temperature database structure has changed and I havn't written a script to fix that yet, so either delete the temperature table or call me and I'll sort it for you...

# Troubleshooting

The logs can be accessed either in the client program by pressing "Show Logs" in the bottom right, if there is an issue, please copy all the logs, also press the "Show Config" then either send this to me or come to this github and make a new 'issue' and attach the logs as a file. Or just paste them...
