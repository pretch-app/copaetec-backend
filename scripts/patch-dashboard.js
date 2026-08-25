const fs = require('fs')

const path = 'components/admin/admin-dashboard.tsx'
let content = fs.readFileSync(path, 'utf8')

// 1. Imports
content = content.replace(
  'import { addMatchAction, updateMatchAction, deleteMatchAction, addGoalAction, deleteGoalAction } from "@/app/admin/actions"',
  'import { addMatchAction, updateMatchAction, deleteMatchAction, addMatchEventAction, deleteMatchEventAction, updateMatchExtrasAction } from "@/app/admin/actions"'
)

content = content.replace(
  'import type { Team, Player, Match, Goal, GalleryItem, TournamentSettings } from "@/lib/types"',
  'import type { Team, Player, Match, MatchEvent, GalleryItem, TournamentSettings } from "@/lib/types"'
)

// 2. Props
content = content.replace(
  'goals: Goal[]',
  'events: MatchEvent[]'
)
content = content.replace(
  '{ teams, players, matches, goals, gallery, settings }',
  '{ teams, players, matches, events, gallery, settings }'
)

// 3. Rename goals variable inside the component
content = content.replace(/const matchGoals = goals\.filter/g, 'const matchGoals = events.filter')

// 4. Extract new section string
const newEventSection = `                  <div className="rounded-md border border-border p-3 flex flex-col gap-4">
                    
                    {/* Sección: Detalles de Partido (Penales, Alargue) */}
                    <form action={wrapAction(updateMatchExtrasAction, "Detalles actualizados")} className="flex flex-col gap-2 p-2 bg-muted/30 rounded border border-border">
                      <input type="hidden" name="id" value={m.id} />
                      <p className="text-sm font-semibold mb-1">Extras (Penales y Tiempo Extra)</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="flex items-center space-x-2 sm:col-span-2">
                          <input type="checkbox" id={\`xtra-\${m.id}\`} name="is_extra_time" defaultChecked={m.is_extra_time} className="h-4 w-4 rounded border-gray-300" />
                          <label htmlFor={\`xtra-\${m.id}\`} className="text-sm font-medium">Hubo Tiempo Extra</label>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="flex flex-col">
                          <Label className="text-xs">Penales Local</Label>
                          <Input type="number" name="home_penalties" defaultValue={m.home_penalties ?? ""} placeholder="Ej: 4" className="h-8" />
                        </div>
                        <div className="flex flex-col">
                          <Label className="text-xs">Penales Visitante</Label>
                          <Input type="number" name="away_penalties" defaultValue={m.away_penalties ?? ""} placeholder="Ej: 3" className="h-8" />
                        </div>
                      </div>
                      <Button type="submit" size="sm" variant="secondary" className="mt-1">Guardar Extras</Button>
                    </form>

                    <div>
                      <p className="mb-2 text-sm font-semibold">Eventos del Partido</p>
                      <ul className="mb-3 flex flex-col gap-1">
                        {matchGoals.map((e) => (
                          <li key={e.id} className="flex items-center justify-between text-sm p-1 rounded hover:bg-muted/50">
                            <span className="flex items-center gap-2">
                              <span className="w-8 text-xs text-muted-foreground">{e.minute ? \`\${e.minute}'\` : ''}</span>
                              <span className="font-medium">{e.player_name}</span> 
                              <span className="text-xs text-muted-foreground truncate w-24">({teamName(teams, e.team_id)})</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
                                {e.event_type === 'goal' ? '⚽ Gol' : 
                                 e.event_type === 'penalty_goal' ? '🎯 Penal' : 
                                 e.event_type === 'own_goal' ? '❌ En contra' :
                                 e.event_type === 'yellow_card' ? '🟨 Amarilla' :
                                 e.event_type === 'red_card' ? '🟥 Roja' :
                                 e.event_type === 'foul' ? '👟 Falta' :
                                 e.event_type === 'shootout_goal' ? '✅ Tanda Gol' : '❌ Tanda Fallo'}
                              </span>
                            </span>
                            <form action={wrapAction(deleteMatchEventAction, "Evento eliminado")}>
                              <input type="hidden" name="id" value={e.id} />
                              <Button variant="ghost" size="sm" type="submit" className="h-6 text-destructive px-2">
                                Quitar
                              </Button>
                            </form>
                          </li>
                        ))}
                        {matchGoals.length === 0 ? <li className="text-sm text-muted-foreground">Sin eventos cargados</li> : null}
                      </ul>
                      
                      <form action={wrapAction(addMatchEventAction, "Evento agregado")} className="grid gap-2 sm:grid-cols-6 p-2 border border-border rounded bg-muted/10">
                        <input type="hidden" name="match_id" value={m.id} />
                        
                        <div className="sm:col-span-2">
                          <select name="team_id" className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" required>
                            <option value={m.home_team_id}>{teamName(teams, m.home_team_id)}</option>
                            <option value={m.away_team_id}>{teamName(teams, m.away_team_id)}</option>
                          </select>
                        </div>
                        
                        <div className="sm:col-span-2">
                          <select name="event_type" className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" required>
                            <option value="goal">⚽ Gol</option>
                            <option value="penalty_goal">🎯 Gol de Penal</option>
                            <option value="own_goal">❌ Gol en contra</option>
                            <option value="yellow_card">🟨 Tarjeta Amarilla</option>
                            <option value="red_card">🟥 Tarjeta Roja</option>
                            <option value="foul">👟 Falta</option>
                            <option value="shootout_goal">✅ Gol (Tanda Penales)</option>
                            <option value="shootout_miss">❌ Fallo (Tanda Penales)</option>
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <Input name="minute" type="number" min="1" max="150" placeholder="Minuto (Ej: 15)" className="h-9" />
                        </div>
                        
                        <div className="sm:col-span-3">
                          <Input name="player_name" placeholder="Nombre del Jugador" className="h-9" required />
                        </div>
                        <div className="sm:col-span-3">
                          <Input name="player_id" type="number" placeholder="ID Jugador (Opcional)" className="h-9" />
                        </div>

                        <div className="sm:col-span-6 mt-1">
                          <Button type="submit" size="sm" variant="secondary" className="w-full">
                            Agregar Evento
                          </Button>
                        </div>
                      </form>
                    </div>
                  </div>`

// 5. We need to replace the two old goals sections. Let's do it manually using split and join to be safe.
// The block starts with `<div className="rounded-md border border-border p-3">` right after `</form>` for match updates, 
// and ends after `</div>` of the `<form action={wrapAction(addGoalAction...)}>`.

// Find the first instance
const startTag = '<div className="rounded-md border border-border p-3">\n                    <p className="mb-2 text-sm font-semibold">Goleadores</p>'
const endTag = 'Agregar gol\n                        </Button>\n                      </div>\n                    </form>\n                  </div>'

let parts = content.split(startTag)
if (parts.length === 3) {
  // It occurs twice as expected
  for (let i = 1; i <= 2; i++) {
    const endIdx = parts[i].indexOf(endTag)
    if (endIdx !== -1) {
      parts[i] = newEventSection + parts[i].substring(endIdx + endTag.length)
    }
  }
}
content = parts[0] + parts[1] + parts[2]

fs.writeFileSync(path, content)
console.log('Patched admin-dashboard.tsx successfully')
