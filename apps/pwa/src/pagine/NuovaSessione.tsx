import {
  schemaModalitaScansione,
  schemaTipoSessione,
  type ClienteDocumento,
  type ModalitaScansione,
  type TipoSessione,
} from '@terminalinobru/core';
import { Play, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Avviso } from '../componenti/Avviso.js';
import { IconaTipo } from '../componenti/IconaTipo.js';
import { Pagina } from '../componenti/Pagina.js';
import { SceltaCliente } from '../componenti/SceltaCliente.js';
import { SchedaCliente } from '../componenti/SchedaCliente.js';
import { db } from '../db.js';
import { useImpostazioni } from '../hooks/useImpostazioni.js';
import { preparaAudio } from '../scanner/feedback.js';
import {
  DESCRIZIONI_MODALITA,
  DESCRIZIONI_TIPO,
  ETICHETTE_MODALITA,
  ETICHETTE_TIPO,
  nomeProposto,
} from '../sessioni/modello.js';
import { creaSessione, ErroreSessione } from '../sessioni/operazioni.js';

const TIPI = schemaTipoSessione.options;
const MODALITA = schemaModalitaScansione.options;

const CLASSE_SCELTA =
  'card flex min-h-14 cursor-pointer items-center gap-3 p-3 has-[:checked]:border-2 has-[:checked]:border-giallo-scuro has-[:checked]:bg-giallo-chiaro has-[:checked]:p-[11px] has-[:focus-visible]:border-2 has-[:focus-visible]:border-grafite';

export function NuovaSessione() {
  const naviga = useNavigate();
  const { impostazioni } = useImpostazioni();
  const [apertura] = useState(() => new Date());
  const [tipo, setTipo] = useState<TipoSessione>('inventario');
  const [nome, setNome] = useState(() => nomeProposto('inventario', apertura));
  const [nomeModificato, setNomeModificato] = useState(false);
  const [note, setNote] = useState('');
  const [modalita, setModalita] = useState<ModalitaScansione>();
  const [errore, setErrore] = useState<string>();
  const [salvataggio, setSalvataggio] = useState(false);
  const [cliente, setCliente] = useState<ClienteDocumento>();
  const [sceltaCliente, setSceltaCliente] = useState(false);

  // La modalità parte da quella predefinita nelle impostazioni, appena sono lette.
  useEffect(() => {
    if (impostazioni && modalita === undefined) setModalita(impostazioni.modalitaPredefinita);
  }, [impostazioni, modalita]);

  function scegliTipo(nuovo: TipoSessione) {
    setTipo(nuovo);
    if (!nomeModificato) setNome(nomeProposto(nuovo, apertura));
  }

  async function inizia() {
    // Tocco sul pulsante: momento buono per sbloccare l'audio dello scanner.
    preparaAudio();
    setSalvataggio(true);
    setErrore(undefined);
    try {
      const sessione = await creaSessione(db, {
        tipo,
        nome,
        note,
        modalita: modalita ?? impostazioni?.modalitaPredefinita ?? 'chiedi_quantita',
        dispositivo: impostazioni?.dispositivo ?? '',
        ...(tipo === 'ddt' && cliente ? { cliente } : {}),
      });
      void naviga(`/sessioni/${sessione.id}`, { replace: true });
    } catch (e) {
      setErrore(e instanceof ErroreSessione ? e.message : 'Sessione non creata: riprova.');
      setSalvataggio(false);
    }
  }

  return (
    <Pagina titolo="Nuova sessione" indietro="/">
      {errore && (
        <div className="-mx-4 -mt-4">
          <Avviso tipo="errore">{errore}</Avviso>
        </div>
      )}
      <form
        className="flex flex-col gap-5"
        onSubmit={(evento) => {
          evento.preventDefault();
          void inizia();
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-titolo text-base font-bold tracking-wide uppercase">
            Tipo
          </legend>
          {TIPI.map((voce) => (
            <label key={voce} className={CLASSE_SCELTA}>
              <input
                type="radio"
                name="tipo"
                value={voce}
                className="sr-only"
                checked={tipo === voce}
                onChange={() => scegliTipo(voce)}
              />
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-giallo text-nero">
                <IconaTipo tipo={voce} />
              </span>
              <span className="min-w-0">
                <span className="block font-titolo font-bold">{ETICHETTE_TIPO[voce]}</span>
                <span className="etichetta block">{DESCRIZIONI_TIPO[voce]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {tipo === 'ddt' && (
          <div className="flex flex-col gap-2">
            <h3 id="etichetta-cliente" className="font-titolo text-base font-bold uppercase">
              Cliente{' '}
              <span className="etichetta font-testo font-normal normal-case">(obbligatorio)</span>
            </h3>
            {cliente ? (
              <div className="card flex items-center gap-3 border-2 border-giallo-scuro bg-giallo-chiaro p-[11px]">
                <UserRound size={24} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <SchedaCliente cliente={cliente} />
                </div>
                <button
                  type="button"
                  className="pulsante-secondario shrink-0"
                  onClick={() => setSceltaCliente(true)}
                >
                  Cambia
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-describedby="etichetta-cliente"
                className="pulsante-secondario"
                onClick={() => setSceltaCliente(true)}
              >
                <Search size={20} />
                Scegli cliente
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="nome-sessione" className="font-titolo text-base font-bold uppercase">
            Nome
          </label>
          <input
            id="nome-sessione"
            className="campo"
            autoComplete="off"
            maxLength={100}
            required
            value={nome}
            onChange={(evento) => {
              setNome(evento.target.value);
              setNomeModificato(true);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="note-sessione" className="font-titolo text-base font-bold uppercase">
            Note <span className="etichetta font-testo font-normal normal-case">(facoltative)</span>
          </label>
          <textarea
            id="note-sessione"
            className="campo min-h-24 py-2 focus:py-[7px]"
            maxLength={500}
            value={note}
            onChange={(evento) => setNote(evento.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-titolo text-base font-bold tracking-wide uppercase">
            Modalità di scansione
          </legend>
          {MODALITA.map((voce) => (
            <label key={voce} className={CLASSE_SCELTA}>
              <input
                type="radio"
                name="modalita"
                value={voce}
                className="sr-only"
                checked={modalita === voce}
                onChange={() => setModalita(voce)}
              />
              <span className="min-w-0">
                <span className="block font-bold">{ETICHETTE_MODALITA[voce]}</span>
                <span className="etichetta block">{DESCRIZIONI_MODALITA[voce]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <button type="submit" className="pulsante-primario" disabled={salvataggio}>
          <Play size={20} />
          {salvataggio ? 'Creazione…' : 'Inizia sessione'}
        </button>
      </form>

      {sceltaCliente && (
        <SceltaCliente
          onChiudi={() => setSceltaCliente(false)}
          onScegli={(scelto) => {
            setCliente(scelto);
            setSceltaCliente(false);
            setErrore(undefined);
          }}
        />
      )}
    </Pagina>
  );
}
