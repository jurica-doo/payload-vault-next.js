import Link from "next/link";
import { VaultIcon } from "../../components/icons";
import { MiniFooter } from "../../components/footer/MiniFooter";

export const DatenschutzPage = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8 animate-fade-in">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-color-primary no-underline mb-8 hover:opacity-80 transition-opacity py-3"
        >
          <VaultIcon className="w-6 h-6" />
          <span className="font-semibold text-sm">Zurück zur Startseite</span>
        </Link>

        <h1 className="text-color-text-main mb-8">Datenschutzerklärung</h1>

        <div className="flex flex-col gap-8 text-color-text-secondary text-sm sm:text-base leading-relaxed">
          {/* 1. Überblick */}
          <section>
            <h3 className="text-color-primary mb-3">
              1. Datenschutz auf einen Blick
            </h3>
            <h4 className="text-color-text-main mb-2 text-base font-semibold">
              Allgemeine Hinweise
            </h4>
            <p className="text-color-text-secondary">
              Die folgenden Hinweise geben einen einfachen Überblick darüber,
              was mit Ihren personenbezogenen Daten passiert, wenn Sie diese
              Website nutzen. Personenbezogene Daten sind alle Daten, mit denen
              Sie persönlich identifiziert werden können. Ausführliche
              Informationen zum Thema Datenschutz entnehmen Sie unserer
              nachfolgenden Datenschutzerklärung.
            </p>
            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Datenerfassung auf dieser Website
            </h4>
            <p className="text-color-text-secondary">
              <strong className="text-color-text-main">
                Wer ist verantwortlich für die Datenerfassung auf dieser
                Website?
              </strong>
              <br />
              Die Datenverarbeitung auf dieser Website erfolgt durch den
              Websitebetreiber. Dessen Kontaktdaten können Sie dem Abschnitt
              „Hinweis zur verantwortlichen Stelle" in dieser
              Datenschutzerklärung entnehmen.
            </p>
            <p className="text-color-text-secondary mt-2">
              <strong className="text-color-text-main">
                Wie erfassen wir Ihre Daten?
              </strong>
              <br />
              Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese
              mitteilen. Hierbei kann es sich z.&nbsp;B. um Daten handeln, die
              Sie bei der Registrierung oder beim Hochladen von Dokumenten
              eingeben. Andere Daten werden automatisch oder nach Ihrer
              Einwilligung beim Besuch der Website durch unsere IT-Systeme
              erfasst. Das sind vor allem technische Daten (z.&nbsp;B.
              Internetbrowser, Betriebssystem oder Uhrzeit des Seitenaufrufs).
            </p>
            <p className="text-color-text-secondary mt-2">
              <strong className="text-color-text-main">
                Wofür nutzen wir Ihre Daten?
              </strong>
              <br />
              PayloadVault ist eine Anwendung zur digitalen Verwaltung von
              Belegen, Rechnungen und steuerrelevanten Dokumenten. Ihre Daten
              werden erhoben, um Ihnen diese Dienste bereitzustellen, Ihre
              Dokumente sicher zu speichern und Ihre Einnahmen und Ausgaben zu
              verwalten. Ein Teil der Daten wird erhoben, um eine fehlerfreie
              Bereitstellung der Website zu gewährleisten.
            </p>
            <p className="text-color-text-secondary mt-2">
              <strong className="text-color-text-main">
                Welche Rechte haben Sie bezüglich Ihrer Daten?
              </strong>
              <br />
              Sie haben jederzeit das Recht, unentgeltlich Auskunft über
              Herkunft, Empfänger und Zweck Ihrer gespeicherten
              personenbezogenen Daten zu erhalten. Sie haben außerdem ein Recht,
              die Berichtigung oder Löschung dieser Daten zu verlangen. Wenn Sie
              eine Einwilligung zur Datenverarbeitung erteilt haben, können Sie
              diese Einwilligung jederzeit für die Zukunft widerrufen. Außerdem
              haben Sie das Recht, unter bestimmten Umständen die Einschränkung
              der Verarbeitung Ihrer personenbezogenen Daten zu verlangen.
              Ferner steht Ihnen ein Beschwerderecht bei der zuständigen
              Aufsichtsbehörde zu.
            </p>
          </section>

          {/* 2. Hosting */}
          <section>
            <h3 className="text-color-primary mb-3">2. Hosting</h3>
            <p className="text-color-text-secondary">
              Die Inhalte unserer Website werden bei folgendem Anbieter
              gehostet:
            </p>
            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Supabase
            </h4>
            <p className="text-color-text-secondary">
              Wir nutzen Supabase (Supabase Inc., 970 Toa Payoh North #07-04,
              Singapore 318992) für die Authentifizierung, Datenbankverwaltung
              und Dateispeicherung. Bei der Nutzung unserer Anwendung werden
              Daten auf Servern von Supabase verarbeitet und gespeichert.
              Supabase setzt auf eine Infrastruktur, die den Anforderungen der
              DSGVO entspricht.
            </p>
            <p className="text-color-text-secondary mt-2">
              Weitere Informationen entnehmen Sie der Datenschutzerklärung von
              Supabase.
            </p>
            <p className="text-color-text-secondary mt-2">
              Die Verwendung von Supabase erfolgt auf Grundlage von Art. 6 Abs.
              1 lit. f DSGVO. Wir haben ein berechtigtes Interesse an einer
              möglichst zuverlässigen und sicheren Darstellung und
              Bereitstellung unserer Website. Sofern eine entsprechende
              Einwilligung abgefragt wurde, erfolgt die Verarbeitung
              ausschließlich auf Grundlage von Art. 6 Abs. 1 lit. a DSGVO.
            </p>
          </section>

          {/* 3. Allgemeine Hinweise und Pflichtinfos */}
          <section>
            <h3 className="text-color-primary mb-3">
              3. Allgemeine Hinweise und Pflichtinformationen
            </h3>
            <h4 className="text-color-text-main mb-2 text-base font-semibold">
              Datenschutz
            </h4>
            <p className="text-color-text-secondary">
              Die Betreiber dieser Seiten nehmen den Schutz Ihrer persönlichen
              Daten sehr ernst. Wir behandeln Ihre personenbezogenen Daten
              vertraulich und entsprechend den gesetzlichen
              Datenschutzvorschriften sowie dieser Datenschutzerklärung.
            </p>
            <p className="text-color-text-secondary mt-2">
              Wir weisen darauf hin, dass die Datenübertragung im Internet
              (z.&nbsp;B. bei der Kommunikation per E-Mail) Sicherheitslücken
              aufweisen kann. Ein lückenloser Schutz der Daten vor dem Zugriff
              durch Dritte ist nicht möglich.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Hinweis zur verantwortlichen Stelle
            </h4>
            <p className="text-color-text-secondary">
              Die verantwortliche Stelle für die Datenverarbeitung auf dieser
              Website ist:
            </p>
            <p className="text-color-text-secondary mt-2">
              [First and last name]
              <br />
              [Street and house number]
              <br />
              [Postal code and city]
              <br />
              Deutschland
            </p>
            <p className="text-color-text-secondary mt-2">
              Telefon: [Phone number]
              <br />
              E-Mail: [Email address]
            </p>
            <p className="text-color-text-secondary mt-2">
              Verantwortliche Stelle ist die natürliche oder juristische Person,
              die allein oder gemeinsam mit anderen über die Zwecke und Mittel
              der Verarbeitung von personenbezogenen Daten entscheidet.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Speicherdauer
            </h4>
            <p className="text-color-text-secondary">
              Soweit innerhalb dieser Datenschutzerklärung keine speziellere
              Speicherdauer genannt wurde, verbleiben Ihre personenbezogenen
              Daten bei uns, bis der Zweck für die Datenverarbeitung entfällt.
              Wenn Sie ein berechtigtes Löschersuchen geltend machen oder eine
              Einwilligung zur Datenverarbeitung widerrufen, werden Ihre Daten
              gelöscht, sofern wir keine anderen rechtlich zulässigen Gründe für
              die Speicherung Ihrer personenbezogenen Daten haben; in letzterem
              Fall erfolgt die Löschung nach Fortfall dieser Gründe.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Widerruf Ihrer Einwilligung zur Datenverarbeitung
            </h4>
            <p className="text-color-text-secondary">
              Viele Datenverarbeitungsvorgänge sind nur mit Ihrer ausdrücklichen
              Einwilligung möglich. Sie können eine bereits erteilte
              Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit der bis zum
              Widerruf erfolgten Datenverarbeitung bleibt vom Widerruf
              unberührt.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Recht auf Datenübertragbarkeit
            </h4>
            <p className="text-color-text-secondary">
              Sie haben das Recht, Daten, die wir auf Grundlage Ihrer
              Einwilligung oder in Erfüllung eines Vertrags automatisiert
              verarbeiten, an sich oder an einen Dritten in einem gängigen,
              maschinenlesbaren Format aushändigen zu lassen. Sofern Sie die
              direkte Übertragung der Daten an einen anderen Verantwortlichen
              verlangen, erfolgt dies nur, soweit es technisch machbar ist.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Auskunft, Löschung und Berichtigung
            </h4>
            <p className="text-color-text-secondary">
              Sie haben im Rahmen der geltenden gesetzlichen Bestimmungen
              jederzeit das Recht auf unentgeltliche Auskunft über Ihre
              gespeicherten personenbezogenen Daten, deren Herkunft und
              Empfänger und den Zweck der Datenverarbeitung und ggf. ein Recht
              auf Berichtigung oder Löschung dieser Daten. Hierzu sowie zu
              weiteren Fragen zum Thema personenbezogene Daten können Sie sich
              jederzeit an uns wenden.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Recht auf Einschränkung der Verarbeitung
            </h4>
            <p className="text-color-text-secondary">
              Sie haben das Recht, die Einschränkung der Verarbeitung Ihrer
              personenbezogenen Daten zu verlangen. Hierzu können Sie sich
              jederzeit an uns wenden. Das Recht auf Einschränkung der
              Verarbeitung besteht in folgenden Fällen:
            </p>
            <ul className="list-disc list-inside text-color-text-secondary mt-2 space-y-1">
              <li>
                Wenn Sie die Richtigkeit Ihrer bei uns gespeicherten
                personenbezogenen Daten bestreiten.
              </li>
              <li>
                Wenn die Verarbeitung Ihrer personenbezogenen Daten unrechtmäßig
                geschah/geschieht und Sie statt der Löschung die Einschränkung
                der Datenverarbeitung verlangen.
              </li>
              <li>
                Wenn wir Ihre personenbezogenen Daten nicht mehr benötigen, Sie
                diese jedoch zur Ausübung, Verteidigung oder Geltendmachung von
                Rechtsansprüchen benötigen.
              </li>
              <li>
                Wenn Sie Widerspruch nach Art. 21 Abs. 1 DSGVO eingelegt haben.
              </li>
            </ul>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Beschwerderecht bei der zuständigen Aufsichtsbehörde
            </h4>
            <p className="text-color-text-secondary">
              Im Falle von Verstößen gegen die DSGVO steht den Betroffenen ein
              Beschwerderecht bei einer Aufsichtsbehörde zu, insbesondere in dem
              Mitgliedstaat ihres gewöhnlichen Aufenthalts, ihres Arbeitsplatzes
              oder des Orts des mutmaßlichen Verstoßes. Das Beschwerderecht
              besteht unbeschadet anderweitiger verwaltungsrechtlicher oder
              gerichtlicher Rechtsbehelfe.
            </p>
          </section>

          {/* 4. Datenerfassung */}
          <section>
            <h3 className="text-color-primary mb-3">
              4. Datenerfassung auf dieser Website
            </h3>

            <h4 className="text-color-text-main mb-2 text-base font-semibold">
              Registrierung auf dieser Website
            </h4>
            <p className="text-color-text-secondary">
              Sie können sich auf dieser Website registrieren, um zusätzliche
              Funktionen auf der Seite zu nutzen. Die dazu eingegebenen Daten
              verwenden wir nur zum Zwecke der Nutzung des jeweiligen Angebotes
              oder Dienstes, für den Sie sich registriert haben. Bei der
              Registrierung wird Folgendes erfasst:
            </p>
            <ul className="list-disc list-inside text-color-text-secondary mt-2 space-y-1">
              <li>E-Mail-Adresse</li>
              <li>Passwort (verschlüsselt gespeichert)</li>
            </ul>
            <p className="text-color-text-secondary mt-2">
              Die Authentifizierung erfolgt über Supabase Auth. Passwörter
              werden nach aktuellen Sicherheitsstandards gehasht und nicht im
              Klartext gespeichert. Die Verarbeitung erfolgt auf Grundlage von
              Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) bzw. Art. 6 Abs. 1
              lit. a DSGVO (Einwilligung).
            </p>
            <p className="text-color-text-secondary mt-2">
              Die bei der Registrierung erfassten Daten werden von uns
              gespeichert, solange Sie auf dieser Website registriert sind, und
              werden anschließend gelöscht. Gesetzliche Aufbewahrungsfristen
              bleiben unberührt.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Hochgeladene Dokumente
            </h4>
            <p className="text-color-text-secondary">
              Im Rahmen der Nutzung von PayloadVault können Sie PDF-Dokumente
              (Rechnungen, Belege, Abrechnungen) hochladen. Diese werden in
              Supabase Storage gespeichert und sind nur für Sie als
              authentifizierter Nutzer zugänglich. Aus den hochgeladenen
              Dokumenten werden folgende Daten extrahiert und in der Datenbank
              gespeichert:
            </p>
            <ul className="list-disc list-inside text-color-text-secondary mt-2 space-y-1">
              <li>Rechnungsnummer</li>
              <li>Rechnungsdatum</li>
              <li>Beträge (netto, brutto, MwSt.)</li>
              <li>Kategorie-Zuordnungen</li>
            </ul>
            <p className="text-color-text-secondary mt-2">
              Diese Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b
              DSGVO, da sie zur Bereitstellung des vertraglich vereinbarten
              Dienstes erforderlich ist.
            </p>

            <h4 className="text-color-text-main mb-2 mt-4 text-base font-semibold">
              Lokale Speicherung (Local Storage)
            </h4>
            <p className="text-color-text-secondary">
              Diese Website verwendet den Local Storage Ihres Browsers, um
              Benutzereinstellungen zu speichern. Dabei werden folgende Daten
              lokal auf Ihrem Gerät abgelegt:
            </p>
            <ul className="list-disc list-inside text-color-text-secondary mt-2 space-y-1">
              <li>
                Theme-Präferenz (hell/dunkel) – damit Ihre bevorzugte
                Darstellung beibehalten wird
              </li>
              <li>Authentifizierungs-Token – damit Sie angemeldet bleiben</li>
            </ul>
            <p className="text-color-text-secondary mt-2">
              Diese Daten werden nicht an Server übertragen und verbleiben
              ausschließlich auf Ihrem Endgerät. Sie können den Local Storage
              jederzeit über die Browsereinstellungen löschen.
            </p>
          </section>

          {/* 5. Externe Dienste */}
          <section>
            <h3 className="text-color-primary mb-3">
              5. Verwendete externe Dienste und Technologien
            </h3>

            <h4 className="text-color-text-main mb-2 text-base font-semibold">
              Supabase
            </h4>
            <p className="text-color-text-secondary">
              Wir nutzen Supabase für folgende Funktionen:
            </p>
            <ul className="list-disc list-inside text-color-text-secondary mt-2 space-y-1">
              <li>
                <strong className="text-color-text-main">
                  Authentifizierung:
                </strong>{" "}
                Registrierung, Anmeldung und Passwortverwaltung
              </li>
              <li>
                <strong className="text-color-text-main">Datenbank:</strong>{" "}
                Speicherung von Rechnungsdaten, Kategorien und Nutzerzuordnungen
              </li>
              <li>
                <strong className="text-color-text-main">
                  Dateispeicherung:
                </strong>{" "}
                Sichere Speicherung hochgeladener PDF-Dokumente
              </li>
            </ul>
            <p className="text-color-text-secondary mt-2">
              Die Datenverarbeitung erfolgt gemäß den Datenschutzrichtlinien von
              Supabase und in Übereinstimmung mit der DSGVO.
            </p>
          </section>

          {/* 6. Datensicherheit */}
          <section>
            <h3 className="text-color-primary mb-3">6. Datensicherheit</h3>
            <p className="text-color-text-secondary">
              Diese Website nutzt aus Sicherheitsgründen eine
              SSL-/TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen
              Sie daran, dass die Adresszeile des Browsers von „http://" auf
              „https://" wechselt und an dem Schloss-Symbol in Ihrer
              Browserzeile.
            </p>
            <p className="text-color-text-secondary mt-2">
              Wenn die SSL- bzw. TLS-Verschlüsselung aktiviert ist, können die
              Daten, die Sie an uns übermitteln, nicht von Dritten mitgelesen
              werden.
            </p>
            <p className="text-color-text-secondary mt-2">
              Darüber hinaus setzen wir folgende Sicherheitsmaßnahmen ein:
            </p>
            <ul className="list-disc list-inside text-color-text-secondary mt-2 space-y-1">
              <li>Verschlüsselte Passwortspeicherung durch Supabase Auth</li>
              <li>
                Row-Level-Security (RLS) in der Datenbank – jeder Nutzer hat nur
                Zugriff auf seine eigenen Daten
              </li>
              <li>Sichere Token-basierte Authentifizierung</li>
              <li>
                Regelmäßige Sicherheitsupdates der eingesetzten Technologien
              </li>
            </ul>
          </section>

          {/* 7. Aktualität */}
          <section>
            <h3 className="text-color-primary mb-3">
              7. Aktualität und Änderung dieser Datenschutzerklärung
            </h3>
            <p className="text-color-text-secondary">
              Diese Datenschutzerklärung ist aktuell gültig und hat den Stand
              April 2026.
            </p>
            <p className="text-color-text-secondary mt-2">
              Durch die Weiterentwicklung unserer Website oder aufgrund
              geänderter gesetzlicher beziehungsweise behördlicher Vorgaben kann
              es notwendig werden, diese Datenschutzerklärung zu ändern. Die
              jeweils aktuelle Datenschutzerklärung kann jederzeit auf dieser
              Seite abgerufen werden.
            </p>
          </section>
        </div>
      </main>
      <MiniFooter />
    </div>
  );
};
