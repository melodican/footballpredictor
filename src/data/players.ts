export interface Player {
  name: string
  team: string
}

// Top scorer candidates — common picks, searchable by name
export const PLAYERS: Player[] = [
  // England
  { name: 'Harry Kane', team: 'England' },
  { name: 'Jude Bellingham', team: 'England' },
  { name: 'Bukayo Saka', team: 'England' },
  { name: 'Phil Foden', team: 'England' },
  { name: 'Marcus Rashford', team: 'England' },
  { name: 'Cole Palmer', team: 'England' },

  // France
  { name: 'Kylian Mbappé', team: 'France' },
  { name: 'Antoine Griezmann', team: 'France' },
  { name: 'Ousmane Dembélé', team: 'France' },
  { name: 'Marcus Thuram', team: 'France' },

  // Brazil
  { name: 'Vinicius Jr', team: 'Brazil' },
  { name: 'Rodrygo', team: 'Brazil' },
  { name: 'Richarlison', team: 'Brazil' },
  { name: 'Gabriel Martinelli', team: 'Brazil' },
  { name: 'Pedro', team: 'Brazil' },

  // Argentina
  { name: 'Lionel Messi', team: 'Argentina' },
  { name: 'Lautaro Martínez', team: 'Argentina' },
  { name: 'Julián Álvarez', team: 'Argentina' },
  { name: 'Nicolás González', team: 'Argentina' },

  // Portugal
  { name: 'Cristiano Ronaldo', team: 'Portugal' },
  { name: 'Rafael Leão', team: 'Portugal' },
  { name: 'Gonçalo Ramos', team: 'Portugal' },
  { name: 'Bernardo Silva', team: 'Portugal' },
  { name: 'Bruno Fernandes', team: 'Portugal' },

  // Spain
  { name: 'Lamine Yamal', team: 'Spain' },
  { name: 'Álvaro Morata', team: 'Spain' },
  { name: 'Pedri', team: 'Spain' },
  { name: 'Nico Williams', team: 'Spain' },
  { name: 'Dani Olmo', team: 'Spain' },

  // Germany
  { name: 'Florian Wirtz', team: 'Germany' },
  { name: 'Kai Havertz', team: 'Germany' },
  { name: 'Leroy Sané', team: 'Germany' },
  { name: 'Jamal Musiala', team: 'Germany' },
  { name: 'Thomas Müller', team: 'Germany' },

  // Netherlands
  { name: 'Cody Gakpo', team: 'Netherlands' },
  { name: 'Memphis Depay', team: 'Netherlands' },
  { name: 'Donyell Malen', team: 'Netherlands' },
  { name: 'Xavi Simons', team: 'Netherlands' },

  // Belgium
  { name: 'Romelu Lukaku', team: 'Belgium' },
  { name: 'Dodi Lukebakio', team: 'Belgium' },
  { name: 'Leandro Trossard', team: 'Belgium' },

  // Norway
  { name: 'Erling Haaland', team: 'Norway' },
  { name: 'Martin Ødegaard', team: 'Norway' },
  { name: 'Alexander Sørloth', team: 'Norway' },

  // Sweden
  { name: 'Alexander Isak', team: 'Sweden' },
  { name: 'Viktor Gyökeres', team: 'Sweden' },
  { name: 'Dejan Kulusevski', team: 'Sweden' },

  // Uruguay
  { name: 'Darwin Núñez', team: 'Uruguay' },
  { name: 'Federico Valverde', team: 'Uruguay' },
  { name: 'Rodrigo Bentancur', team: 'Uruguay' },

  // Colombia
  { name: 'Luis Díaz', team: 'Colombia' },
  { name: 'James Rodríguez', team: 'Colombia' },
  { name: 'Jhon Durán', team: 'Colombia' },

  // Morocco
  { name: 'Youssef En-Nesyri', team: 'Morocco' },
  { name: 'Hakim Ziyech', team: 'Morocco' },
  { name: 'Achraf Hakimi', team: 'Morocco' },

  // Senegal
  { name: 'Sadio Mané', team: 'Senegal' },
  { name: 'Ismaïla Sarr', team: 'Senegal' },

  // Egypt
  { name: 'Mohamed Salah', team: 'Egypt' },
  { name: 'Trezeguet', team: 'Egypt' },

  // Japan
  { name: 'Kaoru Mitoma', team: 'Japan' },
  { name: 'Takumi Minamino', team: 'Japan' },
  { name: 'Daichi Kamada', team: 'Japan' },

  // Australia
  { name: 'Mathew Leckie', team: 'Australia' },
  { name: 'Mitchell Duke', team: 'Australia' },

  // USA
  { name: 'Christian Pulisic', team: 'USA' },
  { name: 'Ricardo Pepi', team: 'USA' },
  { name: 'Folarin Balogun', team: 'USA' },

  // Mexico
  { name: 'Santiago Giménez', team: 'Mexico' },
  { name: 'Hirving Lozano', team: 'Mexico' },
  { name: 'Henry Martín', team: 'Mexico' },

  // Scotland
  { name: 'Che Adams', team: 'Scotland' },
  { name: 'Lyndon Dykes', team: 'Scotland' },

  // Canada
  { name: 'Jonathan David', team: 'Canada' },
  { name: 'Alphonso Davies', team: 'Canada' },
  { name: 'Cyle Larin', team: 'Canada' },

  // Czechia
  { name: 'Patrik Schick', team: 'Czechia' },
  { name: 'Tomáš Souček', team: 'Czechia' },

  // Ecuador
  { name: 'Enner Valencia', team: 'Ecuador' },
  { name: 'Moisés Caicedo', team: 'Ecuador' },

  // Ghana
  { name: 'Jordan Ayew', team: 'Ghana' },
  { name: 'Mohammed Kudus', team: 'Ghana' },

  // Croatia
  { name: 'Luka Modrić', team: 'Croatia' },
  { name: 'Andrej Kramarić', team: 'Croatia' },
  { name: 'Ivan Perišić', team: 'Croatia' },
].sort((a, b) => a.name.localeCompare(b.name))
