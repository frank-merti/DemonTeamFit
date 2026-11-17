export const PASSWORD_MIN_LENGTH = 8
const PASSWORD_SPECIAL = /[^A-Za-z0-9]/

export const PASSWORD_HINT =
  `Mínimo ${PASSWORD_MIN_LENGTH} caracteres y al menos un carácter especial (!, @, #, $, %).`

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const TEMP_SPECIALS = '!@#$%&*?'

/** Contraseña temporal legible, con mayúsculas, minúsculas, números y especial. */
export function generateTemporaryPassword(length = 12): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('No se pudo generar la contraseña temporal.')
  }
  const values = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (let index = 0; index < length - 1; index += 1) {
    out += TEMP_ALPHABET[values[index] % TEMP_ALPHABET.length]
  }
  return `${out}${TEMP_SPECIALS[values[length - 1] % TEMP_SPECIALS.length]}`
}

/**
 * Devuelve el problema de la contraseña o `null` si cumple la política.
 * Debe coincidir con `passwordProblem` del Worker.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (password.length > 200) {
    return 'La contraseña no puede rebasar 200 caracteres.'
  }
  if (!PASSWORD_SPECIAL.test(password)) {
    return 'La contraseña debe incluir al menos un carácter especial (por ejemplo !, @, #, $, %).'
  }
  return null
}
