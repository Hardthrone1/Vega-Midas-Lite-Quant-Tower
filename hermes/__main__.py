"""Allow `python -m hermes --bars ... --directive ...`"""
from hermes.agent_loop import _main
raise SystemExit(_main())
