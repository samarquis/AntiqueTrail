import { useCallback, useEffect, useRef, useState } from 'react'
import type { Trip, TripClient, TripCollaboration } from './types'
import type { TripOfflineGrantSource, TripOfflineRuntime } from './tripRuntime'

export interface StartTripPageDeviceCheck {
  tripVersion: number
  currentDeviceBound: boolean
}

export type StartTripPageClient = Pick<TripClient, 'get' | 'getCollaboration' | 'start'> & {
  prepareInitialNavigator(tripId: string, expectedVersion: number): Promise<TripCollaboration>
  verifyInitialNavigatorDevice(tripId: string): Promise<StartTripPageDeviceCheck>
  confirmCurrentNavigatorDevice(tripId: string): Promise<number>
}

class StartTripFailure extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message)
  }
}

interface StartTripSnapshot {
  trip: Trip
  collaboration: TripCollaboration
}

export function StartTripPage({
  tripId,
  client,
  onStarted,
  offlineRuntime,
  offlineGrantSource,
  accountId,
}: {
  tripId: string
  client: StartTripPageClient
  onStarted: (trip: Trip, options: { offlineReady: boolean }) => void | Promise<void>
  offlineRuntime?: TripOfflineRuntime
  offlineGrantSource?: TripOfflineGrantSource
  accountId?: string
}) {
  const [trip, setTrip] = useState<Trip | null>(null)
  const [collaboration, setCollaboration] = useState<TripCollaboration | null>(null)
  const [view, setView] = useState<
    'loading' | 'ready' | 'confirming' | 'working' | 'error' | 'done'
  >('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(false)
  const startButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusToStart = useRef(false)

  const readLatest = useCallback(async (): Promise<StartTripSnapshot> => {
    const [latestTrip, latestCollaboration] = await Promise.all([
      client.get(tripId),
      client.getCollaboration(tripId),
    ])
    if (!latestTrip || latestTrip.id !== tripId || latestCollaboration.tripId !== tripId) {
      throw new StartTripFailure('Trip details could not be confirmed.')
    }
    return { trip: latestTrip, collaboration: latestCollaboration }
  }, [client, tripId])

  useEffect(() => {
    let cancelled = false
    setView('loading')
    void readLatest()
      .then((latest) => {
        if (cancelled) return
        setTrip(latest.trip)
        setCollaboration(latest.collaboration)
        setView('ready')
      })
      .catch(() => {
        if (cancelled) return
        setMessage('Trip details are unavailable. Reconnect and reopen this page.')
        setView('error')
      })
    return () => {
      cancelled = true
    }
  }, [readLatest])

  useEffect(() => {
    if (view === 'confirming') cancelButtonRef.current?.focus()
    if (view === 'ready' && returnFocusToStart.current) {
      returnFocusToStart.current = false
      startButtonRef.current?.focus()
    }
  }, [view])

  function updateSnapshot(latest: StartTripSnapshot) {
    setTrip(latest.trip)
    setCollaboration(latest.collaboration)
  }

  async function confirmActiveDevice(
    currentUserId: string,
    latest: StartTripSnapshot,
  ): Promise<Trip> {
    if (
      latest.trip.state !== 'active' ||
      latest.collaboration.currentUserId !== currentUserId ||
      latest.collaboration.navigatorUserId !== currentUserId
    ) {
      throw new StartTripFailure('The active outing and Navigator identity could not be confirmed.')
    }

    const proofVersion = await client.confirmCurrentNavigatorDevice(tripId)
    const confirmedTrip = await client.get(tripId)
    if (
      !confirmedTrip ||
      confirmedTrip.id !== tripId ||
      confirmedTrip.state !== 'active' ||
      confirmedTrip.version !== proofVersion
    ) {
      throw new StartTripFailure('The active outing changed before it could be reopened.')
    }
    return confirmedTrip
  }

  async function verifyReadyDevice(expectedVersion: number) {
    const device = await client.verifyInitialNavigatorDevice(tripId)
    if (!device.currentDeviceBound) {
      throw new StartTripFailure('This device could not be confirmed as the Navigator device.')
    }
    if (device.tripVersion !== expectedVersion) {
      throw new StartTripFailure(
        'The trip changed during setup. Review its current details before continuing.',
        true,
      )
    }
  }

  async function confirmExistingActive() {
    if (!collaboration || view === 'working') return
    setView('working')
    setMessage(null)
    try {
      const latest = await readLatest()
      updateSnapshot(latest)
      const activeTrip = await confirmActiveDevice(latest.collaboration.currentUserId, latest)
      await onStarted(activeTrip, { offlineReady: false })
      setTrip(activeTrip)
      setView('done')
    } catch (error) {
      setMessage(
        error instanceof StartTripFailure
          ? error.message
          : 'The active outing and current device could not be confirmed.',
      )
      setRetryable(false)
      setView('error')
    }
  }

  async function dispatchStart() {
    if (view === 'working') return
    setView('working')
    setMessage(null)
    setRetryable(false)

    try {
      const latest = await readLatest()
      updateSnapshot(latest)
      const currentUserId = latest.collaboration.currentUserId

      if (latest.trip.state === 'active') {
        const activeTrip = await confirmActiveDevice(currentUserId, latest)
        await onStarted(activeTrip, { offlineReady: false })
        setTrip(activeTrip)
        setView('done')
        return
      }
      if (latest.trip.state !== 'ready') {
        throw new StartTripFailure('The trip is not ready to start.')
      }

      let currentCollaboration = latest.collaboration
      if (currentCollaboration.navigatorUserId !== currentUserId) {
        if (currentCollaboration.navigatorUserId) {
          throw new StartTripFailure('Another Navigator is assigned. Ask them to start the outing.')
        }
        const currentUserIsCreator = currentCollaboration.participants.some(
          (participant) => participant.role === 'creator' && participant.userId === currentUserId,
        )
        if (!currentUserIsCreator) {
          throw new StartTripFailure('Only the trip creator can assign the initial Navigator.')
        }

        try {
          currentCollaboration = await client.prepareInitialNavigator(
            tripId,
            currentCollaboration.tripVersion,
          )
        } catch {
          let afterUncertainSetup: StartTripSnapshot
          try {
            afterUncertainSetup = await readLatest()
          } catch {
            throw new StartTripFailure(
              'Navigator setup may have completed. Reconnect and reopen this page to check it.',
            )
          }
          updateSnapshot(afterUncertainSetup)

          if (
            afterUncertainSetup.trip.state === 'active' &&
            afterUncertainSetup.collaboration.currentUserId === currentUserId &&
            afterUncertainSetup.collaboration.navigatorUserId === currentUserId
          ) {
            const activeTrip = await confirmActiveDevice(currentUserId, afterUncertainSetup)
            await onStarted(activeTrip, { offlineReady: false })
            setTrip(activeTrip)
            setView('done')
            return
          }

          if (
            afterUncertainSetup.trip.state === 'ready' &&
            afterUncertainSetup.collaboration.currentUserId === currentUserId &&
            afterUncertainSetup.collaboration.navigatorUserId === currentUserId
          ) {
            await verifyReadyDevice(afterUncertainSetup.collaboration.tripVersion)
            currentCollaboration = afterUncertainSetup.collaboration
          } else if (
            afterUncertainSetup.trip.state === 'ready' &&
            afterUncertainSetup.collaboration.currentUserId === currentUserId &&
            !afterUncertainSetup.collaboration.navigatorUserId
          ) {
            throw new StartTripFailure(
              'Navigator setup did not apply. Review the trip and confirm again to retry.',
              true,
            )
          } else {
            throw new StartTripFailure('The trip or Navigator changed. Review its current status.')
          }
        }
      }

      if (
        currentCollaboration.currentUserId !== currentUserId ||
        currentCollaboration.navigatorUserId !== currentUserId
      ) {
        throw new StartTripFailure('The current Navigator could not be confirmed.')
      }
      await verifyReadyDevice(currentCollaboration.tripVersion)

      let startedTrip: Trip
      let offlineReady = false
      try {
        if (offlineRuntime && offlineGrantSource && accountId) {
          startedTrip = await offlineRuntime.start(accountId, tripId, offlineGrantSource)
          offlineReady = true
        } else {
          startedTrip = await client.start(tripId)
        }
      } catch {
        let afterStart: StartTripSnapshot
        try {
          afterStart = await readLatest()
        } catch {
          throw new StartTripFailure(
            'Start may have completed, but its result could not be confirmed. Reconnect and reopen this page.',
          )
        }
        updateSnapshot(afterStart)

        if (
          afterStart.trip.state === 'active' &&
          afterStart.collaboration.currentUserId === currentUserId &&
          afterStart.collaboration.navigatorUserId === currentUserId
        ) {
          startedTrip = await confirmActiveDevice(currentUserId, afterStart)
          offlineReady = false
        } else if (
          afterStart.trip.state === 'ready' &&
          afterStart.collaboration.currentUserId === currentUserId &&
          (!afterStart.collaboration.navigatorUserId ||
            afterStart.collaboration.navigatorUserId === currentUserId)
        ) {
          throw new StartTripFailure(
            'The server still shows this trip as ready. Review it and confirm before retrying Start.',
            true,
          )
        } else {
          throw new StartTripFailure('The trip or Navigator changed. Review its current status.')
        }
      }

      await onStarted(startedTrip, { offlineReady })
      setTrip(startedTrip)
      setView('done')
    } catch (error) {
      setMessage(
        error instanceof StartTripFailure
          ? error.message
          : 'Start could not be confirmed. Reconnect and review the trip before continuing.',
      )
      setRetryable(error instanceof StartTripFailure && error.retryable)
      setView('error')
    }
  }

  const assignedToCurrentUser = collaboration?.navigatorUserId === collaboration?.currentUserId
  const currentUserIsCreator = collaboration?.participants.some(
    (participant) =>
      participant.role === 'creator' && participant.userId === collaboration.currentUserId,
  )
  const canStart = Boolean(
    trip?.state === 'ready' &&
      collaboration &&
      (assignedToCurrentUser || (!collaboration.navigatorUserId && currentUserIsCreator)),
  )

  if (view === 'loading') {
    return (
      <main aria-busy="true">
        <section className="page-card" aria-labelledby="start-trip-heading">
          <p className="eyebrow">My Trip</p>
          <h1 id="start-trip-heading" className="page-card__heading">
            Start outing
          </h1>
          <p role="status">Loading trip…</p>
        </section>
      </main>
    )
  }

  return (
    <main aria-busy={view === 'working'}>
      <section className="page-card" aria-labelledby="start-trip-heading">
        <p className="eyebrow">My Trip</p>
        <h1 id="start-trip-heading" className="page-card__heading">
          Start outing
        </h1>
        {message && <p role="alert">{message}</p>}
        {view === 'ready' && trip?.state === 'ready' && canStart && (
          <button
            ref={startButtonRef}
            className="button"
            type="button"
            onClick={() => setView('confirming')}
          >
            Start outing
          </button>
        )}
        {view === 'ready' && trip?.state === 'ready' && !canStart && (
          <p>
            {collaboration?.navigatorUserId &&
            collaboration.navigatorUserId !== collaboration.currentUserId
              ? 'Only the assigned Navigator can start this outing.'
              : 'Only the trip creator can assign the initial Navigator.'}
          </p>
        )}
        {view === 'ready' && trip?.state === 'active' && (
          <button className="button" type="button" onClick={() => void confirmExistingActive()}>
            Confirm device and continue to Go
          </button>
        )}
        {view === 'ready' && trip && !['ready', 'active'].includes(trip.state) && (
          <p>This trip cannot be started from its current state.</p>
        )}
        {view === 'confirming' && (
          <section aria-labelledby="start-confirmation-title">
            <h2 id="start-confirmation-title">Confirm Start</h2>
            <p>
              Start contacts the server. If no Navigator is assigned, this step assigns you and
              binds this device. Cancel now to leave trip and device state unchanged.
            </p>
            <button
              ref={cancelButtonRef}
              className="button button--secondary"
              type="button"
              onClick={() => {
                returnFocusToStart.current = true
                setView('ready')
              }}
            >
              Cancel
            </button>
            <button className="button" type="button" onClick={() => void dispatchStart()}>
              Confirm and start
            </button>
          </section>
        )}
        {view === 'working' && <p role="status">Checking trip and starting…</p>}
        {view === 'error' && retryable && (
          <button className="button" type="button" onClick={() => setView('confirming')}>
            Review and retry
          </button>
        )}
        {view === 'done' && <p role="status">Opening the outing…</p>}
      </section>
    </main>
  )
}
