const colours = ['Erase', 'Lime', 'Coral', 'Sky', 'Lilac', 'Gold', 'Chalk']

function cellLabel(index, value) {
  return `Row ${Math.floor(index / 16) + 1}, column ${index % 16 + 1}, ${value === '0' ? 'empty' : colours[value]}`
}

function setColour(element, value) {
  element.dataset.colour = value
  element.style.setProperty('--pixel', `var(--c${value})`)
}

export function createCanvas(board, palette, onPaint) {
  let selectedColour = 1
  let selectedCell = 0
  let enabled = false

  const cells = Array.from({ length: 256 }, (_, index) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'pixel'
    cell.tabIndex = index === 0 ? 0 : -1
    cell.dataset.cell = index
    cell.setAttribute('aria-label', cellLabel(index, '0'))
    board.append(cell)
    return cell
  })

  const swatches = colours.map((name, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'swatch'
    button.setAttribute('aria-label', name)
    button.setAttribute('aria-pressed', String(index === selectedColour))
    button.title = name
    button.textContent = index === 0 ? '×' : ''
    setColour(button, index)
    button.addEventListener('click', () => {
      selectedColour = index
      swatches.forEach((swatch, colour) => swatch.setAttribute('aria-pressed', String(colour === selectedColour)))
    })
    palette.append(button)
    return button
  })

  board.addEventListener('click', event => {
    const cell = event.target.closest('button[data-cell]')
    if (!cell) return
    cells[selectedCell].tabIndex = -1
    selectedCell = Number(cell.dataset.cell)
    cell.tabIndex = 0
    if (enabled) onPaint({ cell: selectedCell, colour: selectedColour })
  })

  board.addEventListener('keydown', event => {
    const { key } = event
    const index = Number(event.target.dataset.cell)
    const moves = { ArrowUp: -16, ArrowDown: 16, ArrowLeft: -1, ArrowRight: 1 }
    if (!(key in moves)) return
    event.preventDefault()
    if ((key === 'ArrowLeft' && index % 16 === 0) || (key === 'ArrowRight' && index % 16 === 15)) return
    const next = cells[index + moves[key]]
    if (!next) return
    cells[selectedCell].tabIndex = -1
    selectedCell = index + moves[key]
    next.tabIndex = 0
    next.focus()
  })

  return function render(pixels, canPaint) {
    enabled = canPaint
    cells.forEach((cell, index) => {
      const value = pixels[index]
      if (cell.dataset.colour !== value) {
        setColour(cell, value)
        cell.setAttribute('aria-label', cellLabel(index, value))
      }
      cell.setAttribute('aria-disabled', String(!enabled))
    })
  }
}
