"""
__init__.py
===========

Serves the main plotting functions for clusterfun.
Available functions are:
- bar chart
- confusion matrix
- grid
- histogram
- pie_chart
- scatter
- violin
"""
from clusterfun.plot_types.bar_chart import bar_chart  # noqa: F401
from clusterfun.plot_types.confusion_matrix import confusion_matrix  # noqa: F401
from clusterfun.plot_types.grid import grid  # noqa: F401
from clusterfun.plot_types.histogram import histogram  # noqa: F401
from clusterfun.plot_types.pie_chart import pie_chart  # noqa: F401
from clusterfun.plot_types.scatter import scatter  # noqa: F401
from clusterfun.plot_types.violin import violin  # noqa: F401
