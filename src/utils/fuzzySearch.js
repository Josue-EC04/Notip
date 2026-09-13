// ─── Notip Intelligent Fuzzy & Tolerant Search Engine ────────────────────────
// Normalizes accents, diacritics, allows multi-word skipping, and tolerates typos (Damerau-Levenshtein)

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FuzzySearch = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SPANISH_STOP_WORDS = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'de', 'del', 'a', 'al', 'en', 'con', 'por', 'para', 'sin', 'sobre',
    'y', 'e', 'o', 'u', 'que', 'es', 'son', 'se', 'su', 'sus',
    'como', 'cual', 'cuando', 'donde', 'quien'
  ]);

  /**
   * Normaliza texto eliminando acentos, tildes (á->a, ñ->n),
   * caracteres de puntuación (¿ ? ! ¡) y espacios repetidos.
   */
  function normalizeSearchText(text) {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Distancia Damerau-Levenshtein para detectar errores tipográficos,
   * incluyendo swaps/transposiciones adyacentes ("teh" -> "the").
   */
  function damerauLevenshtein(a, b) {
    if (a === b) return 0;
    const la = a.length;
    const lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;

    const d = [];
    for (let i = 0; i <= la; i++) {
      d[i] = new Array(lb + 1);
      d[i][0] = i;
    }
    for (let j = 0; j <= lb; j++) {
      d[0][j] = j;
    }

    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,       // eliminación
          d[i][j - 1] + 1,       // inserción
          d[i - 1][j - 1] + cost // sustitución
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // transposición
        }
      }
    }
    return d[la][lb];
  }

  /**
   * Comprueba si un token de búsqueda coincide con una palabra del documento,
   * permitiendo prefijo, coincidencia exacta o errores de 1 a 2 letras según la longitud.
   */
  function tokenMatchesWord(token, word) {
    if (!token || !word) return false;
    if (token === word) return true;
    if (word.startsWith(token)) return true;

    const tLen = token.length;
    const wLen = word.length;

    // Tokens muy cortos (1-2 letras): solo exacto o prefijo
    if (tLen <= 2) return false;

    // 3 letras: solo exacto o prefijo (ya comprobado arriba)
    if (tLen === 3) return false;

    // 4 letras: permitir 1 error si la longitud es similar o coincide en prefijo
    if (tLen === 4) {
      if (Math.abs(tLen - wLen) <= 1 && damerauLevenshtein(token, word) <= 1) {
        return true;
      }
      if (wLen >= tLen && damerauLevenshtein(token, word.slice(0, tLen)) <= 1) {
        return true;
      }
      return false;
    }

    // 5-6 letras: distancia <= 1
    // 7+ letras: distancia <= 2 (ej. "intelijencia" vs "inteligencia")
    const maxDist = tLen >= 7 ? 2 : 1;

    if (Math.abs(tLen - wLen) <= maxDist) {
      if (damerauLevenshtein(token, word) <= maxDist) return true;
    }

    // Coincidencia de prefijo mientras el usuario escribe (ej. "intelij" en "inteligencia")
    if (wLen >= tLen) {
      if (damerauLevenshtein(token, word.slice(0, tLen)) <= maxDist) return true;
      if (damerauLevenshtein(token, word.slice(0, tLen + 1)) <= maxDist) return true;
    }

    return false;
  }

  /**
   * Evalúa si una nota / tarjeta coincide con una consulta de búsqueda,
   * calculando un puntaje de relevancia (score) y tolerando palabras saltadas o errores tipográficos.
   *
   * @param {Object} note - Objeto con titulo, content o descripcion, tags
   * @param {string} query - Cadena de búsqueda ingresada por el usuario
   * @returns {{ matches: boolean, score: number }}
   */
  function matchNoteSearch(note, query) {
    if (!query) return { matches: true, score: 0 };

    const normQuery = normalizeSearchText(query);
    if (!normQuery) return { matches: true, score: 0 };

    const normTitle = normalizeSearchText(note.titulo || note.title || '');
    const rawTags = Array.isArray(note.tags) ? note.tags.join(' ') : (note.tags || '');
    const normTags = normalizeSearchText(rawTags);
    const normContent = normalizeSearchText((note.content || note.descripcion || '').slice(0, 3000));

    // Coincidencia exacta de frase completa da puntaje máximo
    if (normTitle && normTitle.includes(normQuery)) {
      return { matches: true, score: 1000 + (normTitle === normQuery ? 500 : 200) };
    }
    if (normTags && normTags.includes(normQuery)) {
      return { matches: true, score: 800 };
    }
    if (normContent && normContent.includes(normQuery)) {
      return { matches: true, score: 600 };
    }

    const queryTokens = normQuery.split(/\s+/).filter(Boolean);
    if (queryTokens.length === 0) return { matches: true, score: 0 };

    const titleWords = normTitle ? normTitle.split(/\s+/).filter(Boolean) : [];
    const tagWords = normTags ? normTags.split(/\s+/).filter(Boolean) : [];
    const contentWords = normContent ? normContent.split(/\s+/).filter(Boolean) : [];

    let matchedTokens = 0;
    let matchedSignificantTokens = 0;
    let totalSignificantTokens = 0;
    let totalScore = 0;

    for (const token of queryTokens) {
      const isStopWord = SPANISH_STOP_WORDS.has(token);
      if (!isStopWord) {
        totalSignificantTokens++;
      }

      let tokenMatched = false;

      // 1. Revisar palabras del título (peso más alto)
      for (const w of titleWords) {
        if (token === w) {
          tokenMatched = true;
          totalScore += isStopWord ? 15 : 60;
          break;
        } else if (w.startsWith(token)) {
          tokenMatched = true;
          totalScore += isStopWord ? 10 : 45;
          break;
        } else if (!isStopWord && tokenMatchesWord(token, w)) {
          tokenMatched = true;
          totalScore += 30;
          break;
        }
      }

      // 2. Revisar etiquetas / tags
      if (!tokenMatched) {
        for (const w of tagWords) {
          if (token === w) {
            tokenMatched = true;
            totalScore += isStopWord ? 10 : 50;
            break;
          } else if (w.startsWith(token)) {
            tokenMatched = true;
            totalScore += isStopWord ? 8 : 40;
            break;
          } else if (!isStopWord && tokenMatchesWord(token, w)) {
            tokenMatched = true;
            totalScore += 25;
            break;
          }
        }
      }

      // 3. Revisar contenido
      if (!tokenMatched) {
        for (const w of contentWords) {
          if (token === w) {
            tokenMatched = true;
            totalScore += isStopWord ? 5 : 25;
            break;
          } else if (!isStopWord && w.startsWith(token) && token.length >= 3) {
            tokenMatched = true;
            totalScore += 20;
            break;
          } else if (!isStopWord && tokenMatchesWord(token, w)) {
            tokenMatched = true;
            totalScore += 15;
            break;
          }
        }
      }

      if (tokenMatched) {
        matchedTokens++;
        if (!isStopWord) {
          matchedSignificantTokens++;
        }
      }
    }

    const totalTokens = queryTokens.length;

    // Si la búsqueda incluye palabras significativas, al menos una DEBE coincidir
    if (totalSignificantTokens > 0 && matchedSignificantTokens === 0) {
      return { matches: false, score: 0 };
    }

    let isMatch = false;

    if (totalTokens === 1) {
      isMatch = matchedTokens === 1;
    } else if (totalTokens === 2) {
      isMatch = matchedTokens >= 2 || (totalSignificantTokens === 1 && matchedSignificantTokens === 1 && matchedTokens >= 1);
    } else if (totalTokens === 3) {
      // Permitir saltar 1 palabra en consultas de 3 palabras
      isMatch = matchedTokens >= 2 && (totalSignificantTokens === 0 || matchedSignificantTokens >= 1);
    } else {
      // Consultas de 4+ palabras: permitir saltar palabras manteniendo al menos ~60%
      isMatch = matchedTokens >= Math.ceil(totalTokens * 0.6) && matchedSignificantTokens >= Math.ceil(totalSignificantTokens * 0.5);
    }

    if (matchedTokens === totalTokens) {
      totalScore += 100;
    }

    return { matches: isMatch, score: totalScore };
  }

  return {
    normalizeSearchText,
    damerauLevenshtein,
    tokenMatchesWord,
    matchNoteSearch,
  };
}));
