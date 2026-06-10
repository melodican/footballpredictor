import { useState } from 'react'

// Map participant names to their photo filenames in /public/avatars/
const AVATAR_MAP: Record<string, string> = {
  'Maggie Swallow': '/avatars/maggie.jpg',
  'Glen Kirkham':   '/avatars/glen.jpg',
  'Joe Swallow':    '/avatars/joe.jpg',
  'Fin Bullough':   '/avatars/fin.jpg',
  'Zac Bullough':   '/avatars/zac.jpg',
  'Mike Swallow':   '/avatars/mike.jpg',
  'Sheila Kirkham': '/avatars/sheila.jpg',
  'Spike':          '/avatars/spike.jpg',
  'David Kirkham':  '/avatars/david.jpg',
  'The Oracle':     '/avatars/oracle.png',
  'Rach Bullough':  '/avatars/rach.jpg',
  'Jean Kirkham':   '/avatars/jean.jpg',
  'Gem':            '/avatars/gem.png',
}

const COLOURS = [
  'from-red-600 to-red-800',
  'from-blue-600 to-blue-800',
  'from-emerald-600 to-emerald-800',
  'from-purple-600 to-purple-800',
  'from-orange-500 to-orange-700',
  'from-pink-600 to-pink-800',
  'from-cyan-600 to-cyan-800',
  'from-yellow-500 to-yellow-700',
  'from-indigo-600 to-indigo-800',
  'from-teal-600 to-teal-800',
  'from-rose-600 to-rose-800',
  'from-violet-600 to-violet-800',
]

function getColour(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLOURS[Math.abs(hash) % COLOURS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
}

interface Props {
  name: string
  size?: keyof typeof SIZES
  className?: string
}

export default function PlayerAvatar({ name, size = 'md', className = '' }: Props) {
  const [imgError, setImgError] = useState(false)
  const photoUrl = AVATAR_MAP[name]

  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`${SIZES[size]} rounded-full object-cover flex-shrink-0 ring-2 ring-blue-900 ${className}`}
      />
    )
  }

  return (
    <div className={`${SIZES[size]} rounded-full bg-gradient-to-br ${getColour(name)} flex items-center justify-center flex-shrink-0 font-black text-white ring-2 ring-blue-900 ${className}`}>
      {getInitials(name)}
    </div>
  )
}
